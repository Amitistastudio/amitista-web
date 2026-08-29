#!/usr/bin/env python3

"""Record what each repository looks like right now, for the admin panel.

The panel cannot gather this itself. The GitHub token lives at /root/.gh-oauth,
readable only by root, and the admin API runs as amitista-admin under
ProtectHome=yes — it cannot see /root at all, which is the point. So the deploy,
which is already root and already holds the token, writes what it knows to a
file the panel is allowed to read. The token never leaves this process.

Two kinds of question, both asked every tick. The cheap local ones: what is
checked out, is it dirty, has main moved, did CI pass for the commit at the tip.
And the ones only GitHub can answer — open issues, open pull requests and what
is holding each one up, how far each branch has drifted, what the last workflow
runs actually did, how big the repository has grown.

The second kind used to be rationed to every five minutes to spare the rate
limit. It is not rationed now, because it does not need to be: every one of
those is a conditional request, and GitHub does not charge for answering 304.
An unchanged repository costs round trips and nothing else.

Nothing here deploys or changes a repository. It only looks, and every request
it makes is a GET.

    github-state.py OUT_PATH name=/path/to/checkout [name=/path ...]
    github-state.py --full OUT_PATH name=/path ...   ask GitHub everything now
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ORG = os.environ.get("AUTODEPLOY_ORG", "Amitistastudio")
TOKEN_FILE = os.environ.get("AUTODEPLOY_TOKEN_FILE", "/root/.gh-oauth")
GROUP = os.environ.get("ADMIN_GROUP", "amitista-admin")
BRANCH = "main"
TIMEOUT = 20

# How often the questions only GitHub can answer are actually asked. Once per
# deploy tick, which is to say about once a minute.
#
# This was five minutes on the reasoning that pull requests and branches do not
# move on a one-minute timescale. True, and beside the point: somebody opened an
# issue, went to look for it, and it was not there — and the panel's Refresh
# button re-reads a file rather than asking GitHub, so there was nothing to do
# but wait without knowing how long for. Being right about the data changing
# slowly does not help when the person is standing there.
#
# It is affordable because every one of these is a conditional request. GitHub
# answers an unchanged resource with 304 and does not charge it, so the steady
# state is about fifteen round trips a minute and nothing at all off the hourly
# allowance.
DETAIL_SECONDS = int(os.environ.get("AUTODEPLOY_GITHUB_DETAIL_SECONDS", "60"))

# Ceilings, so one runaway repository cannot bloat the file the panel reads or
# the number of requests one refresh makes.
MAX_PULLS = 20
# Asking after each pull request costs a request or two of its own, so only the
# most recent handful are looked into. Beyond that the list still shows them;
# they just do not carry a verdict until one of the others is dealt with.
MAX_PULL_DETAIL = 10
MAX_FILES = 40
MAX_ISSUES = 30
# Enough of the body to know what an issue is about without opening GitHub, and
# little enough that thirty of them do not bloat the file the panel reads.
MAX_BODY = 1200
MAX_BRANCHES = 30
MAX_COMPARES = 8
MAX_RUNS = 10

# A run GitHub has finished with will never change its mind, so its verdict is
# cached against the commit and never asked for twice. Anything else — queued,
# in progress, no run at all — is asked again next tick. That is what keeps the
# per-tick check free: three repositories idling cost nothing.
TERMINAL = (
    "success",
    "failure",
    "cancelled",
    "timed_out",
    "action_required",
    "neutral",
    "skipped",
    "stale",
)


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_stamp(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def age_seconds(value):
    moment = parse_stamp(value)
    if moment is None:
        return None
    return (datetime.now(timezone.utc) - moment).total_seconds()


def seconds_between(start, end):
    first, second = parse_stamp(start), parse_stamp(end)
    if first is None or second is None:
        return None
    return max(0, int((second - first).total_seconds()))


def first_line(value):
    if not isinstance(value, str):
        return ""
    lines = value.splitlines()
    return lines[0] if lines else ""


def git(path, *args):
    try:
        done = subprocess.run(
            ("git", "-C", path) + args,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if done.returncode != 0:
        return None
    # Only the trailing newline. `status --porcelain` opens with a significant
    # space — the staged/unstaged column — and stripping it shifts every path
    # left by one character.
    return done.stdout.rstrip("\n")


def commit_facts(path, ref):
    """Subject, author and date for a ref, in one call rather than three."""
    out = git(path, "--no-pager", "log", "-1", "--format=%s%n%an%n%cI", ref)
    if out is None:
        return {}
    parts = out.split("\n")
    while len(parts) < 3:
        parts.append("")
    return {"subject": parts[0], "author": parts[1], "committed": parts[2]}


def token():
    try:
        with open(TOKEN_FILE, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


class GitHub:
    """Just enough of the API, with the rate limit taken seriously.

    Conditional requests are the whole trick: GitHub answers an unchanged
    resource with 304 and does not charge it against the hourly limit, so
    re-asking about a repository nobody has touched is free. Every response's
    ETag is kept in the snapshot and handed back on the next request.
    """

    def __init__(self, auth, etags):
        self.auth = auth
        self.etags = dict(etags or {})
        self.remaining = None
        self.limit = None
        self.reset = None
        self.calls = 0
        self.spent = 0
        self.failed = False

    def get(self, path, have_cached=False):
        """Returns (payload, state) where state is ok, unchanged or error.

        Only "ok" carries a body worth projecting. On "unchanged" or "error" the
        caller keeps whatever it recorded last time, so a GitHub outage leaves
        the panel showing the last thing known to be true rather than an empty
        page — clearly marked as such.

        `have_cached` says whether the caller still holds the previous answer.
        The conditional request is only sent when it does: a 304 with nothing to
        fall back on would throw away the data instead of saving a request.
        """
        if not self.auth:
            return None, "error"

        headers = {
            "Authorization": "token %s" % self.auth,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "amitista-autodeploy/1.0",
        }
        tag = self.etags.get(path)
        if tag and have_cached:
            headers["If-None-Match"] = tag

        self.calls += 1
        request = urllib.request.Request("https://api.github.com" + path, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as answer:
                self._note(answer.headers)
                payload = json.load(answer)
                new_tag = answer.headers.get("ETag")
                if new_tag:
                    self.etags[path] = new_tag
                else:
                    self.etags.pop(path, None)
                self.spent += 1
                return payload, "ok"
        except urllib.error.HTTPError as failure:
            self._note(failure.headers)
            if failure.code == 304:
                return None, "unchanged"
            # A 404 (renamed, or no longer visible to this token) and a 500 are
            # different problems, but neither is worth discarding what we knew.
            self.failed = True
            self.spent += 1
            return None, "error"
        except (urllib.error.URLError, OSError, ValueError):
            self.failed = True
            return None, "error"

    def _note(self, headers):
        for name, attribute in (
            ("X-RateLimit-Remaining", "remaining"),
            ("X-RateLimit-Limit", "limit"),
        ):
            try:
                setattr(self, attribute, int(headers.get(name)))
            except (TypeError, ValueError):
                pass
        try:
            self.reset = (
                datetime.fromtimestamp(int(headers.get("X-RateLimit-Reset")), timezone.utc)
                .replace(microsecond=0)
                .isoformat()
                .replace("+00:00", "Z")
            )
        except (TypeError, ValueError):
            pass


# ------------------------------------------------------------------ the tick

def ci_verdict(api, repo, sha, cached_entry):
    """The workflow verdict for one exact commit.

    The verdict deliberately keeps GitHub's own two words — "completed/success",
    "queued/pending", "none" when no run has been recorded — because collapsing
    them to a boolean is what made the last stuck deploy unreadable. "unknown"
    means the question could not be asked, which is not the same as a commit
    having failed, and the panel says so.
    """
    if not sha:
        return "unknown"
    if not api.auth:
        return "unknown"

    settled = (cached_entry.get("ci") or "").split("/")[-1] in TERMINAL
    if cached_entry.get("remote") == sha and settled:
        return cached_entry["ci"]

    payload, state = api.get("/repos/%s/%s/actions/runs?head_sha=%s&per_page=1" % (ORG, repo, sha))
    if state != "ok" or not isinstance(payload, dict):
        return "unknown"
    runs = payload.get("workflow_runs") or []
    if not runs:
        return "none"
    run = runs[0]
    return "%s/%s" % (run.get("status") or "unknown", run.get("conclusion") or "pending")


# ----------------------------------------------------------- the slow questions

def repo_facts(api, repo, cached):
    payload, state = api.get("/repos/%s/%s" % (ORG, repo), bool(cached))
    if state != "ok" or not isinstance(payload, dict):
        return cached or {}
    return {
        "description": payload.get("description"),
        "private": bool(payload.get("private")),
        "sizeKb": payload.get("size"),
        "openIssues": payload.get("open_issues_count"),
        "defaultBranch": payload.get("default_branch"),
        "pushed": payload.get("pushed_at"),
        "url": payload.get("html_url"),
        "language": payload.get("language"),
    }


def pull_extra(api, repo, number, known):
    """What the list of pull requests does not say.

    How much changed, and whether it can actually go in, are only on the single
    pull request endpoint — the list leaves out additions, deletions,
    changed_files, commits and the merge state entirely. So each one is asked
    after separately, which is why only the newest few are.

    mergeable is computed on demand and comes back null until GitHub has worked
    it out, which is a real answer and not the same as "no": the panel says it
    is still being worked out rather than guessing.
    """
    payload, state = api.get("/repos/%s/%s/pulls/%d" % (ORG, repo, number), bool(known))
    if state != "ok" or not isinstance(payload, dict):
        return known or {}
    body = payload.get("body")
    text = body.strip() if isinstance(body, str) else ""
    return {
        "additions": payload.get("additions"),
        "deletions": payload.get("deletions"),
        "files": payload.get("changed_files"),
        "commits": payload.get("commits"),
        "mergeable": payload.get("mergeable"),
        "mergeState": payload.get("mergeable_state"),
        "body": text[:MAX_BODY],
        "clipped": len(text) > MAX_BODY,
    }


def pull_files(api, repo, number, cached):
    payload, state = api.get(
        "/repos/%s/%s/pulls/%d/files?per_page=%d" % (ORG, repo, number, MAX_FILES),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, list):
        return cached if isinstance(cached, list) else []
    return [
        {
            "path": entry.get("filename"),
            "status": entry.get("status"),
            "added": entry.get("additions"),
            "removed": entry.get("deletions"),
        }
        for entry in payload
        if isinstance(entry, dict) and entry.get("filename")
    ]


def pull_ci(api, repo, sha, known):
    """The workflow verdict for the head of a pull request.

    Cached against that exact commit, so a pull request nobody has pushed to
    costs nothing to keep an eye on once its run has finished.
    """
    if not sha:
        return "unknown"
    settled = (known.get("ci") or "").split("/")[-1] in TERMINAL
    if known.get("sha") == sha and settled:
        return known["ci"]
    payload, state = api.get("/repos/%s/%s/actions/runs?head_sha=%s&per_page=1" % (ORG, repo, sha))
    if state != "ok" or not isinstance(payload, dict):
        return "unknown"
    runs = payload.get("workflow_runs") or []
    if not runs:
        return "none"
    run = runs[0]
    return "%s/%s" % (run.get("status") or "unknown", run.get("conclusion") or "pending")


def open_pulls(api, repo, cached):
    payload, state = api.get(
        "/repos/%s/%s/pulls?state=open&sort=created&direction=desc&per_page=%d"
        % (ORG, repo, MAX_PULLS),
        isinstance(cached, list),
    )
    held = cached if isinstance(cached, list) else []

    if state == "unchanged":
        # Nothing has been opened, closed or pushed to — that is what the list's
        # own ETag settles. A workflow finishing does not touch the pull request
        # it ran for, though, so a verdict that had not settled yet would sit
        # there saying "pending" for as long as the list stayed still. Those are
        # asked after; everything else is left exactly as it was.
        out = []
        for entry in held:
            row = dict(entry)
            if row.get("sha") and (row.get("ci") or "").split("/")[-1] not in TERMINAL:
                row["ci"] = pull_ci(api, repo, row["sha"], {})
            out.append(row)
        return out

    if state != "ok" or not isinstance(payload, list):
        return held

    known = {entry.get("number"): entry for entry in held if isinstance(entry, dict)}

    out = []
    for index, entry in enumerate(payload):
        if not isinstance(entry, dict):
            continue
        number = entry.get("number")
        sha = ((entry.get("head") or {}).get("sha"))
        was = known.get(number) or {}
        row = {
            "number": number,
            "title": entry.get("title"),
            "author": ((entry.get("user") or {}).get("login")),
            "draft": bool(entry.get("draft")),
            "created": entry.get("created_at"),
            "updated": entry.get("updated_at"),
            "head": ((entry.get("head") or {}).get("ref")),
            "base": ((entry.get("base") or {}).get("ref")),
            "sha": sha,
            "labels": [
                {"name": label.get("name"), "colour": label.get("color")}
                for label in entry.get("labels") or []
                if isinstance(label, dict) and label.get("name")
            ],
            "reviewers": [
                person.get("login")
                for person in entry.get("requested_reviewers") or []
                if isinstance(person, dict) and person.get("login")
            ],
            "url": entry.get("html_url"),
        }
        if index < MAX_PULL_DETAIL:
            row.update(pull_extra(api, repo, number, was))
            row["changed"] = pull_files(api, repo, number, was.get("changed"))
            row["ci"] = pull_ci(api, repo, sha, was)
        else:
            row["looked"] = False
        out.append(row)
    return out


def open_issues(api, repo, cached):
    """Open issues, and only issues.

    GitHub treats a pull request as an issue, so /issues returns both and every
    pull request would otherwise show up here a second time wearing a different
    hat. The ones carrying a pull_request key are dropped.
    """
    payload, state = api.get(
        "/repos/%s/%s/issues?state=open&sort=updated&direction=desc&per_page=%d"
        % (ORG, repo, MAX_ISSUES),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, list):
        return cached if isinstance(cached, list) else []

    out = []
    for entry in payload:
        # The key's presence is the marker, not its contents. Testing the value
        # lets an entry through whenever GitHub sends an empty object.
        if not isinstance(entry, dict) or "pull_request" in entry:
            continue
        body = entry.get("body")
        text = body.strip() if isinstance(body, str) else ""
        out.append(
            {
                "number": entry.get("number"),
                "title": entry.get("title"),
                "author": ((entry.get("user") or {}).get("login")),
                "labels": [
                    {"name": label.get("name"), "colour": label.get("color")}
                    for label in entry.get("labels") or []
                    if isinstance(label, dict) and label.get("name")
                ],
                "assignees": [
                    person.get("login")
                    for person in entry.get("assignees") or []
                    if isinstance(person, dict) and person.get("login")
                ],
                "milestone": ((entry.get("milestone") or {}).get("title")),
                "comments": entry.get("comments"),
                "created": entry.get("created_at"),
                "updated": entry.get("updated_at"),
                "url": entry.get("html_url"),
                "body": text[:MAX_BODY],
                "clipped": len(text) > MAX_BODY,
            }
        )
    return out


def branch_drift(api, repo, default_branch, cached):
    """Every branch, and how far it has drifted from the default one.

    Branches that never get merged are the quiet kind of mess — the listing
    alone does not show it, so each one is compared. Bounded, because the
    comparison is a request each.
    """
    listing, state = api.get(
        "/repos/%s/%s/branches?per_page=%d" % (ORG, repo, MAX_BRANCHES),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(listing, list):
        return cached if isinstance(cached, list) else []

    known = {entry.get("name"): entry for entry in (cached or []) if isinstance(entry, dict)}
    base = default_branch or BRANCH
    out = []
    compared = 0

    for entry in listing:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        sha = ((entry.get("commit") or {}).get("sha"))
        row = {
            "name": name,
            "sha": sha,
            "protected": bool(entry.get("protected")),
            "default": name == base,
        }
        if name == base:
            row["ahead"] = 0
            row["behind"] = 0
            out.append(row)
            continue

        was = known.get(name) or {}
        # Nothing has moved on this branch since the last look, so the drift it
        # had then is the drift it has now — unless the base moved, which the
        # base's own sha tells us.
        if was.get("sha") == sha and was.get("baseSha") == _sha_of(listing, base) and "ahead" in was:
            out.append({**row, "ahead": was["ahead"], "behind": was["behind"], "baseSha": was.get("baseSha")})
            continue

        if compared >= MAX_COMPARES:
            out.append(row)
            continue
        compared += 1
        payload, compare_state = api.get(
            "/repos/%s/%s/compare/%s...%s"
            % (ORG, repo, urllib.parse.quote(base), urllib.parse.quote(name))
        )
        if compare_state == "ok" and isinstance(payload, dict):
            row["ahead"] = payload.get("ahead_by")
            row["behind"] = payload.get("behind_by")
            row["baseSha"] = _sha_of(listing, base)
        out.append(row)

    return out


def _sha_of(listing, name):
    for entry in listing:
        if isinstance(entry, dict) and entry.get("name") == name:
            return (entry.get("commit") or {}).get("sha")
    return None


def recent_runs(api, repo, cached):
    payload, state = api.get(
        "/repos/%s/%s/actions/runs?per_page=%d" % (ORG, repo, MAX_RUNS),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, dict):
        return cached if isinstance(cached, list) else []
    return [
        {
            "name": entry.get("name"),
            "status": entry.get("status"),
            "conclusion": entry.get("conclusion"),
            "sha": (entry.get("head_sha") or "")[:7],
            "branch": entry.get("head_branch"),
            "event": entry.get("event"),
            "created": entry.get("created_at"),
            "seconds": seconds_between(entry.get("run_started_at"), entry.get("updated_at")),
            "url": entry.get("html_url"),
            "subject": first_line((entry.get("head_commit") or {}).get("message")),
        }
        for entry in (payload.get("workflow_runs") or [])
        if isinstance(entry, dict)
    ]


def detail_for(api, repo, cached):
    facts = repo_facts(api, repo, cached.get("facts") or {})
    pulls = open_pulls(api, repo, cached.get("pulls"))
    issues = open_issues(api, repo, cached.get("issues"))
    branches = branch_drift(api, repo, facts.get("defaultBranch"), cached.get("branches"))
    runs = recent_runs(api, repo, cached.get("runs"))
    return {"facts": facts, "pulls": pulls, "issues": issues, "branches": branches, "runs": runs}


# ---------------------------------------------------------------- assembling

def cached(previous, name):
    for entry in previous.get("repositories") or []:
        if entry.get("name") == name:
            return entry
    return {}


def read_previous(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def inspect(name, path, api, known, want_detail):
    entry = {"name": name, "path": path, "branch": BRANCH}

    head = git(path, "rev-parse", "HEAD")
    if head is None:
        # No checkout, or not a repository. Worth reporting rather than
        # dropping: a repository that should be on this box and is not is
        # exactly the kind of thing this panel exists to show.
        entry.update(
            {
                "present": False,
                "local": None,
                "remote": None,
                "behind": 0,
                "ahead": 0,
                "dirty": [],
                "ci": "unknown",
                "green": False,
                "synced": False,
            }
        )
    else:
        remote = git(path, "rev-parse", "origin/%s" % BRANCH)
        dirty = git(path, "status", "--porcelain", "--untracked-files=no") or ""
        behind = git(path, "rev-list", "--count", "HEAD..origin/%s" % BRANCH) if remote else None
        ahead = git(path, "rev-list", "--count", "origin/%s..HEAD" % BRANCH) if remote else None

        verdict = ci_verdict(api, name, remote, known)
        entry.update(
            {
                "present": True,
                "local": head,
                "remote": remote,
                "behind": int(behind) if (behind or "").isdigit() else 0,
                "ahead": int(ahead) if (ahead or "").isdigit() else 0,
                "dirty": [line[3:] for line in dirty.splitlines() if line[3:]],
                "ci": verdict,
                "green": verdict == "completed/success",
                "synced": bool(remote) and head == remote,
                "head": commit_facts(path, "HEAD"),
            }
        )
        if remote and remote != head:
            entry["tip"] = commit_facts(path, "origin/%s" % BRANCH)

    carried = {
        key: known[key]
        for key in ("facts", "pulls", "issues", "branches", "runs")
        if key in known
    }
    if want_detail:
        entry.update(detail_for(api, name, carried))
        entry["detail"] = now()
    else:
        entry.update(carried)
        if known.get("detail"):
            entry["detail"] = known["detail"]

    return entry


def write_atomic(path, payload):
    out_dir = os.path.dirname(path) or "."
    os.makedirs(out_dir, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=out_dir, prefix=".github-", suffix=".tmp", delete=False
    )
    try:
        json.dump(payload, handle, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        os.chmod(handle.name, 0o640)
        try:
            shutil.chown(handle.name, group=GROUP)
        except (LookupError, PermissionError, OSError):
            # No such group on this box — better readable than unreadable, the
            # snapshot holds no secret.
            os.chmod(handle.name, 0o644)
        os.replace(handle.name, path)
    except BaseException:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
        raise


def main():
    arguments = sys.argv[1:]
    force = False
    if arguments and arguments[0] == "--full":
        force = True
        arguments = arguments[1:]

    if len(arguments) < 2:
        print("usage: github-state.py [--full] OUT_PATH name=/path [name=/path ...]", file=sys.stderr)
        return 2

    out_path = arguments[0]
    pairs = []
    for argument in arguments[1:]:
        name, sep, path = argument.partition("=")
        if not sep or not name or not path:
            print("expected name=path, got %r" % argument, file=sys.stderr)
            return 2
        pairs.append((name, path))

    auth = token()
    previous = read_previous(out_path)

    since = age_seconds(previous.get("detail"))
    want_detail = bool(auth) and (force or since is None or since >= DETAIL_SECONDS)

    api = GitHub(auth, previous.get("etags"))

    repositories = []
    for name, path in pairs:
        repositories.append(inspect(name, path, api, cached(previous, name), want_detail))

    payload = {
        "generated": now(),
        "org": ORG,
        "branch": BRANCH,
        "repositories": repositories,
        "etags": api.etags,
    }
    payload["detail"] = now() if want_detail and not api.failed else previous.get("detail")
    if api.remaining is not None:
        payload["rate"] = {"remaining": api.remaining, "limit": api.limit, "reset": api.reset}
    if not auth:
        payload["note"] = "no GitHub token on this box — nothing could be asked of GitHub"
    elif api.failed:
        payload["note"] = "GitHub could not be reached in full; some of this may be from an earlier look"

    try:
        write_atomic(out_path, payload)
    except OSError as failure:
        print("could not write %s: %s" % (out_path, failure), file=sys.stderr)
        return 1

    clean = sum(1 for entry in repositories if entry.get("synced") and not entry.get("dirty"))
    pulls = sum(len(entry.get("pulls") or []) for entry in repositories)
    issues = sum(len(entry.get("issues") or []) for entry in repositories)
    print(
        "github state: %d/%d in sync and clean, %d open PR(s), %d open issue(s); %d request(s), %d charged%s"
        % (clean, len(repositories), pulls, issues, api.calls, api.spent,
           "" if api.remaining is None else ", %d left this hour" % api.remaining)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
