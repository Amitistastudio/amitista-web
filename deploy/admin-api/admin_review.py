"""Ask a model what a pull request does, and what looks wrong with it.

Two questions rather than one, because they want different answers and mixing
them produces a worse version of both. The first is a summary: what changed and
why, in a paragraph somebody can read before deciding whether to open the diff
at all. The second is a review: specific things that look wrong, each pinned to
a file and a line, so it can be checked rather than believed.

What it is not: an approval. Nothing here writes to GitHub, nothing here merges,
and the panel says so. A model reading a truncated diff with no way to run the
code is a reader with an opinion, and the section is worded as one — findings
are things to look at, not defects that have been established.

The diff comes out of the snapshot the deploy already writes. This service holds
no GitHub token and cannot ask for a patch itself, which is the whole point of
that arrangement, so a pull request the collector has not looked into deeply
cannot be reviewed here and says so plainly.

Answers are cached against the exact head commit. Re-asking about a pull request
nobody has pushed to costs nothing and gives everybody the same answer; pushing
to it invalidates the review, because a review of the previous commit is worse
than no review at all.
"""

import json
import logging
import os
import re
import tempfile
import time
import urllib.error
import urllib.request

log = logging.getLogger("admin-api.review")

URL = os.environ.get("ADMIN_AI_URL", "https://integrate.api.nvidia.com/v1/chat/completions").strip()
MODEL = os.environ.get("ADMIN_AI_MODEL", "nvidia/nemotron-3-nano-30b-a3b").strip()
TIMEOUT = int(os.environ.get("ADMIN_AI_TIMEOUT", "60"))
CACHE_PATH = os.environ.get("ADMIN_GITHUB_REVIEWS", "/var/lib/amitista/admin/github-reviews.json")

# Enough room for a paragraph and a handful of findings, and a hard stop well
# short of anything that could be used to run up a bill.
MAX_TOKENS = int(os.environ.get("ADMIN_AI_MAX_TOKENS", "1400"))
MAX_PROMPT_CHARS = 60000
MAX_FINDINGS = 12
MAX_SUMMARY_CHARS = 1200
MAX_NOTE_CHARS = 400
MAX_CACHED = 60

SEVERITIES = ("high", "medium", "low")

SYSTEM = (
    "You review pull requests for a small studio's private codebase. You are given the "
    "title, the branch, the list of changed files and as much of the diff as fits.\n\n"
    "Answer with a single JSON object and nothing else, in this shape:\n"
    '{"summary": "...", "findings": [{"file": "...", "line": 0, "severity": "high|medium|low", '
    '"note": "..."}]}\n\n'
    "summary: two to four sentences. What this change does and why, in plain English, for "
    "somebody deciding whether they need to read the diff. Say what it touches. Do not "
    "restate the file list.\n\n"
    "findings: things that look wrong and are worth checking, most serious first. A bug, an "
    "unhandled case, a security or correctness problem, a change that contradicts itself. "
    "Each needs the file it is in, the line if you can tell, and one or two sentences saying "
    "what goes wrong and when. Be concrete: name the input or the state that triggers it.\n\n"
    "Leave findings empty if nothing stands out. An empty list is a good answer and is much "
    "better than a list of style opinions, restated diff, or guesses about code you were not "
    "shown. You are reading a truncated diff without the surrounding file, so say nothing you "
    "cannot support from what is in front of you."
)


class ReviewError(Exception):

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def configured():
    return bool(key() and URL and MODEL)


def key():
    return os.environ.get("ADMIN_AI_KEY", "").strip()


def _read_cache():
    try:
        with open(CACHE_PATH, encoding="utf-8") as handle:
            held = json.load(handle)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        log.warning("could not read the review cache at %s", CACHE_PATH)
        return {}
    return held if isinstance(held, dict) else {}


def _write_cache(held):
    """Keep the newest few and replace the file in one step.

    Rewritten whole rather than appended because the cap has to be applied
    somewhere, and replaced atomically so a concurrent reader sees the old file
    or the new one and never half of either.
    """
    rows = sorted(held.items(), key=lambda pair: pair[1].get("generated") or 0, reverse=True)
    trimmed = dict(rows[:MAX_CACHED])
    try:
        os.makedirs(os.path.dirname(CACHE_PATH) or ".", exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=os.path.dirname(CACHE_PATH) or ".",
            prefix=".reviews-",
            suffix=".tmp",
            delete=False,
        )
        try:
            json.dump(trimmed, handle, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
            os.replace(handle.name, CACHE_PATH)
        except BaseException:
            try:
                os.unlink(handle.name)
            except OSError:
                pass
            raise
    except OSError:
        # A review that cannot be cached is still a review. Losing it costs one
        # repeated request the next time somebody asks, which is not worth
        # failing the answer that is already in hand.
        log.warning("could not write the review cache at %s", CACHE_PATH)


def cached(repo, number, sha):
    held = _read_cache().get("%s#%s" % (repo, number))
    if isinstance(held, dict) and held.get("sha") == sha:
        return held
    return None


def remember(repo, number, review):
    held = _read_cache()
    held["%s#%s" % (repo, number)] = review
    _write_cache(held)


def prompt_for(pull, repo):
    """The pull request as the model sees it.

    Files with a diff come first, because a file GitHub would not give a patch
    for — anything binary, anything too large to inline — contributes nothing to
    a review and would otherwise push a file that does out of the budget.
    """
    changed = [entry for entry in (pull.get("changed") or []) if isinstance(entry, dict)]
    lines = [
        "Repository: %s" % repo,
        "Pull request: #%s %s" % (pull.get("number"), pull.get("title") or "untitled"),
        "Branch: %s into %s" % (pull.get("head") or "?", pull.get("base") or "?"),
        "Size: %s files, +%s -%s"
        % (pull.get("files") or len(changed), pull.get("additions") or "?", pull.get("deletions") or "?"),
    ]
    body = (pull.get("body") or "").strip()
    if body:
        lines.append("\nWhat the author wrote:\n%s" % body[:2000])

    lines.append("\nFiles changed:")
    for entry in changed:
        lines.append(
            "  %s %s (+%s -%s)"
            % (entry.get("status") or "?", entry.get("path"), entry.get("added"), entry.get("removed"))
        )

    room = MAX_PROMPT_CHARS - sum(len(line) for line in lines)
    patched = [entry for entry in changed if entry.get("patch")]
    if patched:
        lines.append("\nDiff:")
        for entry in patched:
            block = "\n--- %s\n%s%s" % (
                entry.get("path"),
                entry["patch"],
                "\n[diff truncated]" if entry.get("clipped") else "",
            )
            if len(block) > room:
                lines.append("\n[%d more file(s) not shown]" % (len(patched) - patched.index(entry)))
                break
            lines.append(block)
            room -= len(block)

    return "\n".join(lines)


def _clean(value, ceiling):
    text = value if isinstance(value, str) else ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:ceiling]


def parse(payload, paths):
    """Pull the answer out of whatever the model actually said.

    Models wrap JSON in prose and in code fences often enough that refusing
    those would mean failing on a good answer. Anything that is not an object
    with a summary is a failure, though, rather than something to guess at.

    Every finding is pinned to a file that is genuinely in the pull request.
    A model naming a file it was not shown is either confused or has invented
    the finding, and either way the panel must not print a location that does
    not exist.
    """
    text = payload if isinstance(payload, str) else ""
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ReviewError(502, "The model did not answer with a review.")
    try:
        held = json.loads(text[start : end + 1])
    except ValueError:
        raise ReviewError(502, "The model's answer could not be read as a review.")
    if not isinstance(held, dict):
        raise ReviewError(502, "The model's answer could not be read as a review.")

    known = set(paths)
    findings = []
    for entry in held.get("findings") or []:
        if not isinstance(entry, dict):
            continue
        note = _clean(entry.get("note"), MAX_NOTE_CHARS)
        if not note:
            continue
        where = entry.get("file") if entry.get("file") in known else None
        line = entry.get("line")
        findings.append(
            {
                "file": where,
                "line": line if isinstance(line, int) and not isinstance(line, bool) and line > 0 else None,
                "severity": entry.get("severity") if entry.get("severity") in SEVERITIES else "low",
                "note": note,
            }
        )

    summary = _clean(held.get("summary"), MAX_SUMMARY_CHARS)
    if not summary:
        raise ReviewError(502, "The model did not say what the pull request does.")

    findings.sort(key=lambda row: SEVERITIES.index(row["severity"]))
    return {"summary": summary, "findings": findings[:MAX_FINDINGS]}


def ask(question):
    body = json.dumps(
        {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": question},
            ],
            "temperature": 0.2,
            "max_tokens": MAX_TOKENS,
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        URL,
        data=body,
        headers={
            "Authorization": "Bearer %s" % key(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as error:
        log.warning("the model answered %s", error.code)
        raise ReviewError(502, "The model would not answer. Try again in a moment.")
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        log.warning("could not reach the model at %s", URL)
        raise ReviewError(502, "The model could not be reached. Try again in a moment.")

    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not choices:
        raise ReviewError(502, "The model answered with nothing.")
    return ((choices[0] or {}).get("message") or {}).get("content") or ""


def review(pull, repo):
    if not configured():
        raise ReviewError(
            503,
            "No model is configured for the admin panel. Set ADMIN_AI_KEY in admin.env and "
            "restart the service.",
        )

    changed = [entry for entry in (pull.get("changed") or []) if isinstance(entry, dict)]
    if not any(entry.get("patch") for entry in changed):
        raise ReviewError(
            409,
            "The deploy has not collected a diff for this pull request, so there is nothing to "
            "read. Only the most recently opened few are looked into that deeply.",
        )

    answer = parse(ask(prompt_for(pull, repo)), [entry.get("path") for entry in changed])
    answer.update(
        {
            "repo": repo,
            "number": pull.get("number"),
            "sha": pull.get("sha"),
            "model": MODEL,
            "generated": time.time(),
            "partial": any(entry.get("clipped") for entry in changed),
        }
    )
    return answer
