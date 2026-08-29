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

Almost all of it only looks, and every request it makes to read something is a
GET. The one exception is access: the panel can ask for somebody's permission on
a repository to be changed, and it leaves that request in a queue directory
because it has no token to carry it out with. This process drains that queue —
checking every field of it again from scratch, because the account that wrote it
is not one this trusts — and records what happened. Nothing here deploys, merges
or pushes.

    github-state.py OUT_PATH name=/path/to/checkout [name=/path ...]
    github-state.py --full OUT_PATH name=/path ...   ask GitHub everything now
"""

import json
import os
import re
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
# Everything ever raised, not only what is open, so the panel can answer "has
# this been done before" without anybody leaving it. Shallow rows and one
# conditional request per repository, which is what makes the depth affordable.
MAX_PULL_HISTORY = 60
# How many of the history rows are looked into for their reviews and their
# workflow verdict. Both are asked once and then never again: a closed pull
# request cannot gain a review, and a finished run does not change its mind, so
# after the first tick these cost nothing at all.
MAX_HISTORY_DETAIL = 15
# Every review on one pull request. A hundred is GitHub's page ceiling and far
# past anything three people will produce, so this never has to page.
MAX_REVIEWS = 100
MAX_FILES = 40
# How much of each file's diff is kept, and how much across the whole pull
# request. Enough for a review to be about the code rather than the file names,
# and little enough that forty files cannot make the snapshot unreadable.
#
# These never reach the panel. The admin API strips them before the snapshot
# travels, because the browser has no use for a diff it does not display and
# every reader would pay for it. They are kept so that the one thing that does
# want them — an on-demand review — has something to read without this process
# needing to be asked again.
MAX_PATCH_CHARS = 4000
MAX_PATCH_TOTAL = 48000
MAX_ISSUES = 30
# Enough recent commits to draw a fortnight of activity and say who has been
# doing it, across all three repositories at once. Still one request each.
MAX_COMMITS = 40
# Enough of the body to know what an issue is about without opening GitHub, and
# little enough that thirty of them do not bloat the file the panel reads.
MAX_BODY = 1200
MAX_BRANCHES = 30
MAX_COMPARES = 8
MAX_RUNS = 10
MAX_PEOPLE = 100
MAX_STAT_WEEKS = 26

# Where the admin panel leaves a permission change it would like carried out.
#
# The panel cannot make one itself, and that is not an oversight to be fixed
# later — the whole arrangement of this file exists so the token stays in root's
# hands. So the panel writes what it wants into this directory, which it can
# write and root can read, and this process decides whether to do it.
#
# Which means nothing in that directory is trusted. It is written by a service
# running as a different, less privileged account; if that account were ever
# taken, the queue is the first thing that would be used, so every field is
# checked here again from scratch rather than believed.
# What the performance monitor measured, and what the deploy was serving when it
# did. Two files written by two things that never speak to each other: the
# monitor knows the numbers and which release was live, the deploy knows which
# commit that release is. Joined here because this is the one process that also
# holds the commits and pull requests to join them to.
PERF_HISTORY = os.environ.get("AUTODEPLOY_PERF_HISTORY", "/var/lib/amitista/perf/history.jsonl")
RELEASE_LEDGER = os.environ.get("AUTODEPLOY_RELEASE_LEDGER", "/var/www/amitista.com/releases.jsonl")
# Only one of the three repositories is the site, so only one of them can have
# made it slower.
PERF_REPO = os.environ.get("AUTODEPLOY_PERF_REPO", "amitista-web")
# Enough releases to see a fortnight of deploys, and enough runs behind them to
# have several measurements of each. Both are read every tick, so both are
# ceilings on work as much as on size.
MAX_PERF_RELEASES = 20
MAX_PERF_RUNS = 400
# Core Web Vitals as a headless browser can honestly produce them, plus the ones
# that explain a change in them. LCP first because it is the one that moves.
#
# INP is not here and cannot be: it measures how long the page took to respond
# to a real interaction, and nobody interacts with this one. TBT is the lab
# stand-in the field agrees on — the blocking time an interaction would have had
# to queue behind — and the panel labels it as that rather than passing it off
# as the third vital.
PERF_METRICS = ("lcp", "cls", "tbt", "fcp", "ttfb", "longTaskMs", "bytes")
# What a metric has to move by before the panel calls it a change rather than
# the box having been busy. Mirrors the monitor's own floors deliberately: it
# alerts on one run against one run, this compares medians of several, and the
# two agreeing about what counts as a shift is what stops the panel and the
# alert telling different stories about the same deploy.
PERF_FLOOR = {"lcp": 120, "fcp": 120, "ttfb": 120, "tbt": 50, "cls": 0.02, "longTaskMs": 150, "bytes": 20480}
PERF_FRACTION = 0.1
# Squash and merge both leave the pull request number at the end of the subject.
PULL_IN_SUBJECT = re.compile(r"\(#(\d+)\)\s*$")

QUEUE_DIR = os.environ.get("ADMIN_GITHUB_QUEUE", "/var/lib/amitista/admin/github-queue")
MAX_QUEUE_PER_TICK = 20
MAX_ACTION_LOG = 25

# The permissions GitHub takes for a repository collaborator, weakest first.
ROLES = ("pull", "triage", "push", "maintain", "admin")

# GitHub's own rule for a login: alphanumerics and single inner hyphens, up to
# thirty-nine characters. Checked because the login goes into a URL path.
LOGIN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")


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


def said_by(failure):
    """GitHub's own words for why it said no, if it left any.

    Read once, straight off the error body, because urllib hands it over as a
    stream that can only be read the once.
    """
    try:
        said = json.loads(failure.read())
    except (ValueError, OSError):
        return None
    if not isinstance(said, dict) or not said.get("message"):
        return None
    reason = said["message"]
    errors = said.get("errors")
    if isinstance(errors, list) and errors:
        first = errors[0]
        if isinstance(first, dict) and first.get("message"):
            reason = "%s — %s" % (reason, first["message"])
    return reason


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
        # Two different bad outcomes, kept apart because only one of them means
        # what is on the page might be old.
        #
        # "Unreachable" is GitHub not answering: a timeout, a broken connection,
        # a 5xx, a rate limit. Whatever that request was for is missing from
        # this look, so the last one has to stand in and the panel has to say
        # so. "Refused" is GitHub answering, and the answer being no. That is a
        # fact about the account, the plan or the token, it will read the same
        # in a minute, and it makes nothing on the page older than it says.
        #
        # Conflating the two is what made the panel claim GitHub could not be
        # reached, permanently, on a box that was reaching it perfectly well
        # nine times a minute and being told no.
        self.unreachable = False
        self.refused = []
        # The status each path last came back with. An error is not one thing:
        # a 404 on the secret scanning feed means this plan does not offer it
        # and never will, and a 502 means ask again in a minute. The panel has
        # to say which, so the code is kept rather than flattened into "error".
        self.codes = {}
        # What GitHub said about it, when it said no. Its own wording is worth
        # keeping: "Dependabot alerts are disabled for this repository" and
        # "Advanced Security must be enabled" are both 403, and guessing from
        # the code alone gets one of them wrong.
        self.messages = {}

    def get(self, path, have_cached=False, expected=()):
        """Returns (payload, state) where state is ok, unchanged or error.

        Only "ok" carries a body worth projecting. On "unchanged" or "error" the
        caller keeps whatever it recorded last time, so a GitHub outage leaves
        the panel showing the last thing known to be true rather than an empty
        page — clearly marked as such.

        `have_cached` says whether the caller still holds the previous answer.
        The conditional request is only sent when it does: a 304 with nothing to
        fall back on would throw away the data instead of saving a request.

        `expected` lists the statuses this caller has a story for — a feed this
        plan does not offer answers 404 every time and the panel renders that as
        an answer, so it is not counted as anything having gone wrong.
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
                self.codes[path] = 200
                return payload, "ok"
        except urllib.error.HTTPError as failure:
            self._note(failure.headers)
            self.codes[path] = failure.code
            if failure.code == 304:
                return None, "unchanged"
            self.messages[path] = said_by(failure)
            self.spent += 1
            # A 404 (renamed, or no longer visible to this token) and a 500 are
            # different problems, but neither is worth discarding what we knew.
            # They differ in whether asking again would help: a 5xx or a rate
            # limit is GitHub not answering this minute, everything else is
            # GitHub's answer.
            if failure.code >= 500 or failure.code == 429:
                self.unreachable = True
            elif failure.code not in expected:
                self.refused.append((path, failure.code))
            return None, "error"
        except (urllib.error.URLError, OSError, ValueError):
            self.unreachable = True
            self.codes[path] = None
            return None, "error"

    def code_for(self, path):
        return self.codes.get(path)

    def message_for(self, path):
        return self.messages.get(path)

    def send(self, method, path, body=None):
        """The only thing in this file that changes anything at GitHub.

        Everything else is a GET, and deliberately so. This exists for one
        reason: the admin panel has no token and no route to the internet worth
        the name, so a permission change it wants made has to be carried out by
        something that does. Returns (payload, status, error).

        Never conditional. A cached ETag has nothing to do with a request that
        is trying to change something, and sending If-None-Match on a PUT would
        get it refused rather than skipped.
        """
        if not self.auth:
            return None, None, "no token on this box"

        headers = {
            "Authorization": "token %s" % self.auth,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "amitista-autodeploy/1.0",
        }
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        self.calls += 1
        self.spent += 1
        request = urllib.request.Request(
            "https://api.github.com" + path, data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as answer:
                self._note(answer.headers)
                raw = answer.read()
                try:
                    return json.loads(raw) if raw else None, answer.status, None
                except ValueError:
                    return None, answer.status, None
        except urllib.error.HTTPError as failure:
            self._note(failure.headers)
            reason = said_by(failure) or "GitHub refused it (%d)" % failure.code
            return None, failure.code, reason
        except (urllib.error.URLError, OSError) as failure:
            return None, None, "GitHub could not be reached (%s)" % failure

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

    Asked unconditionally, unlike everything else here, and that is deliberate.
    mergeable and mergeable_state are derived — GitHub recomputes them from the
    merge and check status rather than storing them — and the resource's ETag
    does not reliably move when only they change. Caught in the act: a pull
    request sat at "unstable" through a 304 for minutes after GitHub had settled
    it to "clean", so the panel was telling the reader a check was unhappy about
    a pull request that was ready to merge. A wrong verdict is worse than the
    request it saves, and only the newest few are asked after anyway.
    """
    payload, state = api.get("/repos/%s/%s/pulls/%d" % (ORG, repo, number))
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

    out = []
    budget = MAX_PATCH_TOTAL
    for entry in payload:
        if not isinstance(entry, dict) or not entry.get("filename"):
            continue
        row = {
            "path": entry.get("filename"),
            "status": entry.get("status"),
            "added": entry.get("additions"),
            "removed": entry.get("deletions"),
        }
        # A file with no patch is normal rather than a failure: GitHub leaves it
        # out for anything it treats as binary, and for a diff too large to
        # inline. Recorded as clipped either way, so whatever reads this can say
        # it is working from part of the change rather than all of it.
        patch = entry.get("patch")
        if isinstance(patch, str) and patch and budget > 0:
            room = min(MAX_PATCH_CHARS, budget)
            row["patch"] = patch[:room]
            row["clipped"] = len(patch) > room
            budget -= len(row["patch"])
        elif isinstance(patch, str) and patch:
            row["clipped"] = True
        out.append(row)
    return out


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


# The verdicts people have left on a pull request.
#
# GitHub keeps every review ever submitted, including the ones since superseded,
# so the raw list says nothing about where a pull request stands. What counts is
# each person's latest decisive review: an approval or a request for changes,
# with a dismissal wiping out whichever it replaced. A review that only left a
# comment is not a verdict at all and never overrides one — somebody who
# approved and then commented has still approved.
#
# Reduced here rather than in the panel because the reduction is GitHub's rule
# rather than a display choice, and getting it wrong would have the panel say a
# pull request was approved when its approval had been dismissed.
DECISIVE = ("APPROVED", "CHANGES_REQUESTED", "DISMISSED")


def pull_reviews(api, repo, number, cached):
    payload, state = api.get(
        "/repos/%s/%s/pulls/%d/reviews?per_page=%d" % (ORG, repo, number, MAX_REVIEWS),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, list):
        return cached if isinstance(cached, list) else []

    latest = {}
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        login = ((entry.get("user") or {}).get("login"))
        verdict = entry.get("state")
        if not login or not isinstance(verdict, str):
            continue
        at = entry.get("submitted_at")
        held = latest.get(login)
        if verdict in DECISIVE:
            latest[login] = {"login": login, "state": verdict, "at": at}
        elif held is None:
            latest[login] = {"login": login, "state": verdict, "at": at}

    return [row for row in latest.values() if row["state"] != "PENDING"]


def pull_history(api, repo, cached):
    """Every pull request, open or not, as far back as the ceiling allows.

    A separate request from the open list rather than a widening of it, because
    the two want different things. The open list is asked in the order work
    arrives and is looked into deeply; this one is asked newest-touched first
    and stays shallow, so a hundred closed pull requests cost one round trip and
    a few kilobytes rather than two hundred requests.

    Open pull requests appear in both. That is deliberate: this is the record of
    what has been raised, and leaving out the ones still in flight would make it
    lie by omission. The panel shows the detailed copy where it has one.
    """
    payload, state = api.get(
        "/repos/%s/%s/pulls?state=all&sort=updated&direction=desc&per_page=%d"
        % (ORG, repo, MAX_PULL_HISTORY),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, list):
        return cached if isinstance(cached, list) else []

    known = {entry.get("number"): entry for entry in (cached or []) if isinstance(entry, dict)}

    out = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        number = entry.get("number")
        if number is None:
            continue
        merged = entry.get("merged_at")
        closed = entry.get("closed_at")
        out.append(
            {
                "number": number,
                "sha": ((entry.get("head") or {}).get("sha")),
                "title": entry.get("title"),
                "author": ((entry.get("user") or {}).get("login")),
                "state": "merged" if merged else ("closed" if closed else "open"),
                "draft": bool(entry.get("draft")),
                "created": entry.get("created_at"),
                "updated": entry.get("updated_at"),
                "closed": closed,
                "merged": merged,
                "mergedBy": ((entry.get("merged_by") or {}).get("login")),
                "head": ((entry.get("head") or {}).get("ref")),
                "base": ((entry.get("base") or {}).get("ref")),
                "labels": [
                    {"name": label.get("name"), "colour": label.get("color")}
                    for label in entry.get("labels") or []
                    if isinstance(label, dict) and label.get("name")
                ],
                "reviewers": [
                    who.get("login")
                    for who in entry.get("requested_reviewers") or []
                    if isinstance(who, dict) and who.get("login")
                ],
                "url": entry.get("html_url"),
            }
        )

    for index, row in enumerate(out):
        if index >= MAX_HISTORY_DETAIL:
            break
        was = known.get(row["number"]) or {}
        row["reviews"] = history_reviews(api, repo, row, was)
        row["ci"] = pull_ci(api, repo, row.get("sha"), was)
    return out


def history_reviews(api, repo, row, was):
    """The reviews on a pull request in the history, asked once per change.

    GitHub moves updated_at when a review is submitted, so a pull request that
    has not been touched since the last look cannot have gained one and the
    cached answer stands without a request being made at all. That is what makes
    it affordable to keep the review history of closed pull requests: they stop
    being touched, so they are asked after once and then never again.

    Not the same as a conditional request, which would still cost a round trip
    per pull request per tick. This costs nothing.
    """
    held = was.get("reviews")
    if isinstance(held, list) and was.get("updated") == row.get("updated"):
        return held
    return pull_reviews(api, repo, row["number"], held)


def open_pulls(api, repo, cached):
    payload, state = api.get(
        "/repos/%s/%s/pulls?state=open&sort=created&direction=desc&per_page=%d"
        % (ORG, repo, MAX_PULLS),
        isinstance(cached, list),
    )
    held = cached if isinstance(cached, list) else []

    if state == "unchanged":
        # Nothing has been opened, closed or pushed to — that is what the list's
        # own ETag settles, and it is why the titles, authors and branches below
        # are taken from what was already known.
        #
        # It settles nothing about the two things that move on their own. A
        # workflow finishing does not touch the pull request it ran for, and the
        # merge state is recomputed rather than stored. Both would otherwise sit
        # frozen at whatever they were when the list last changed — which is how
        # a ready pull request came to be reported as having an unhappy check.
        out = []
        for index, entry in enumerate(held):
            row = dict(entry)
            number = row.get("number")
            if index < MAX_PULL_DETAIL and number is not None:
                row.update(pull_extra(api, repo, number, row))
                row["changed"] = pull_files(api, repo, number, row.get("changed"))
                row["reviews"] = pull_reviews(api, repo, number, row.get("reviews"))
                if row.get("sha"):
                    row["ci"] = pull_ci(api, repo, row["sha"], entry)
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
            row["reviews"] = pull_reviews(api, repo, number, was.get("reviews"))
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


def recent_commits(api, repo, cached):
    """The last few commits on the default branch.

    The workflow runs already carry a commit each, but only for commits a
    workflow ran on, and only the run's view of them. This is the actual
    activity: who has been committing, to what, and when.
    """
    payload, state = api.get(
        "/repos/%s/%s/commits?per_page=%d" % (ORG, repo, MAX_COMMITS),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, list):
        return cached if isinstance(cached, list) else []

    out = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        commit = entry.get("commit") or {}
        author = commit.get("author") or {}
        # The account is not always the person: a commit can carry an author
        # git knows about and no GitHub account at all. Both are kept, and the
        # panel prefers the name that was actually signed.
        account = entry.get("author") or {}
        out.append(
            {
                "sha": (entry.get("sha") or "")[:7],
                "subject": first_line(commit.get("message")),
                "author": author.get("name"),
                "login": account.get("login") if isinstance(account, dict) else None,
                "at": author.get("date"),
                "url": entry.get("html_url"),
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


def contributions(api, repo, cached):
    payload, state = api.get(
        "/repos/%s/%s/stats/contributors" % (ORG, repo),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, list) or not payload:
        return cached if isinstance(cached, list) else []

    out = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        account = entry.get("author") or {}
        login = account.get("login") if isinstance(account, dict) else None
        if not login:
            continue
        weeks = [week for week in entry.get("weeks") or [] if isinstance(week, dict)]
        recent = weeks[-MAX_STAT_WEEKS:]
        out.append(
            {
                "login": login,
                "avatar": account.get("avatar_url"),
                "url": account.get("html_url"),
                "commits": entry.get("total"),
                "added": sum(int(week.get("a") or 0) for week in weeks),
                "removed": sum(int(week.get("d") or 0) for week in weeks),
                "weeks": [
                    {
                        "week": week_start(week.get("w")),
                        "commits": int(week.get("c") or 0),
                        "added": int(week.get("a") or 0),
                        "removed": int(week.get("d") or 0),
                    }
                    for week in recent
                ],
            }
        )
    return sorted(out, key=lambda row: row.get("commits") or 0, reverse=True)


def week_start(stamp):
    try:
        return datetime.fromtimestamp(int(stamp), timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def punch_card(api, repo, cached):
    payload, state = api.get(
        "/repos/%s/%s/stats/punch_card" % (ORG, repo),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, list) or not payload:
        return cached if isinstance(cached, list) else []

    out = []
    for entry in payload:
        if not isinstance(entry, list) or len(entry) != 3:
            continue
        day, hour, commits = entry
        if not isinstance(day, int) or not isinstance(hour, int):
            continue
        if not isinstance(commits, int) or commits <= 0:
            continue
        if not 0 <= day <= 6 or not 0 <= hour <= 23:
            continue
        out.append({"day": day, "hour": hour, "commits": commits})
    return out


# ------------------------------------------------------------------ security

# How many of each kind of alert to carry. The panel wants the worst few and a
# count, not a tracker.
MAX_ALERTS = 20

# How far back the local scan reads. Far enough to cover anything recent that
# went in without the hook running, short enough to stay cheap at a tick a
# minute.
SCAN_COMMITS = 50

# What GitHub itself has to say, and — where it says nothing — whether that is
# because there is nothing to say or because this plan does not offer the
# feature at all.
#
# The distinction is the whole point of this block. A private repository on the
# Free plan gets no secret scanning and no code scanning: the endpoints answer
# 404, and an empty list drawn from a 404 is not a clean bill of health. Showing
# it as one would be the most dangerous thing this panel could do, so an
# unavailable feed says so in as many words and never counts as zero.
ALERT_FEEDS = (
    ("dependabot", "dependabot/alerts", "dependencies with a known vulnerability"),
    ("secretScanning", "secret-scanning/alerts", "credentials committed to the repository"),
    ("codeScanning", "code-scanning/alerts", "findings from code analysis"),
)

# GitHub answers an unavailable feed in more than one way, and the wording it
# deserves differs. These are the fallbacks: GitHub usually says why in the body
# of the refusal and its own sentence is used in preference, because the status
# alone is not enough to tell these apart. Both of
#
#   403 "Dependabot alerts are disabled for this repository."
#   403 "Advanced Security must be enabled for this repository to use code scanning."
#
# arrive as 403, and only one of them is something this account can switch on;
# reading either as "the token may not ask" sends somebody to fix the wrong
# thing.
ALERT_WHY = {
    404: "not available on this repository — GitHub offers it on paid plans, or it is switched off",
    403: "not available to this repository or this token",
    401: "the deploy's token was refused",
}

# The statuses that mean "GitHub answered, and the answer was no". Handled here,
# in as many words, so they are not also counted as GitHub having been out of
# reach — which would mark the whole snapshot as possibly stale on a box that
# was reaching GitHub perfectly well.
ALERT_REFUSALS = (401, 403, 404)

# How long a feed that said no is believed for. A plan does not change between
# ticks, so asking every minute spends nine charged requests an hour for three
# answers that are the same every time — while an upgrade or a switch flipped in
# settings still shows up within the half hour without anyone doing anything.
ALERT_RECHECK_SECONDS = int(os.environ.get("AUTODEPLOY_ALERT_RECHECK_SECONDS", "1800"))


def alert_row(feed, entry):
    """One alert, flattened to what a panel row needs."""
    if not isinstance(entry, dict):
        return None
    row = {
        "number": entry.get("number"),
        "url": entry.get("html_url"),
        "at": entry.get("created_at"),
        "state": entry.get("state"),
    }
    if feed == "dependabot":
        advisory = entry.get("security_advisory") or {}
        package = ((entry.get("dependency") or {}).get("package") or {})
        row["severity"] = advisory.get("severity")
        row["title"] = advisory.get("summary")
        row["subject"] = package.get("name")
    elif feed == "secretScanning":
        row["severity"] = "critical"
        row["title"] = entry.get("secret_type_display_name") or entry.get("secret_type")
        row["subject"] = entry.get("push_protection_bypassed") and "push protection bypassed" or None
    else:
        rule = entry.get("rule") or {}
        row["severity"] = rule.get("security_severity_level") or rule.get("severity")
        row["title"] = rule.get("description") or rule.get("name")
        row["subject"] = ((entry.get("most_recent_instance") or {}).get("location") or {}).get("path")
    return row


def security_alerts(api, repo, cached):
    """Every alert feed GitHub offers, each saying whether it is offered."""
    held = cached if isinstance(cached, dict) else {}
    out = {}
    for feed, tail, what in ALERT_FEEDS:
        path = "/repos/%s/%s/%s?state=open&per_page=%d" % (ORG, repo, tail, MAX_ALERTS)
        was = held.get(feed) or {}

        # A feed that answered "no" recently is not asked again yet. Unlike a
        # 304 this one is charged every time, so re-asking it each tick is the
        # only thing on this page that costs anything in the steady state.
        asked = age_seconds(was.get("checked"))
        if was.get("available") is False and asked is not None and asked < ALERT_RECHECK_SECONDS:
            out[feed] = was
            continue

        payload, condition = api.get(
            path, isinstance(was.get("items"), list), expected=ALERT_REFUSALS
        )

        if condition == "unchanged" or (condition == "error" and api.code_for(path) is None):
            # Nothing new, or GitHub was unreachable. Either way the last answer
            # is still the best one available and is kept as it was — including
            # when it was last asked, which a look that never happened has not
            # moved on.
            out[feed] = was or {"available": None, "what": what, "items": [], "open": 0}
            continue

        if condition == "error":
            code = api.code_for(path)
            out[feed] = {
                "available": False,
                "what": what,
                "why": api.message_for(path)
                or ALERT_WHY.get(code, "GitHub answered %s" % code),
                "items": [],
                "open": 0,
                "checked": now(),
            }
            continue

        rows = [row for row in (alert_row(feed, entry) for entry in payload or []) if row]
        out[feed] = {
            "available": True,
            "what": what,
            "items": rows,
            "open": len(rows),
            "checked": now(),
        }
    return out


def scan_range(path):
    """The range the local scan reads: the last SCAN_COMMITS, or all of them."""
    depth = git(path, "rev-list", "--count", "HEAD")
    if depth and depth.isdigit() and int(depth) > SCAN_COMMITS:
        return "HEAD~%d..HEAD" % SCAN_COMMITS
    root = git(path, "rev-list", "--max-parents=0", "HEAD")
    first = (root or "").splitlines()[0] if root else ""
    return "%s..HEAD" % first if first else None


def local_scan(path, head, was):
    """Run the repository's own credential scanner over its recent history.

    This is the half that does not depend on anybody's clone being set up
    properly. The pre-push hook only ever runs on the machine doing the pushing
    and only if that machine enabled it; this runs on the box, every time the
    tip moves, over what actually landed. If the two ever disagree, this one is
    the one that is true.

    A repository that does not carry the scanner is reported as not carrying it
    rather than as clean, for the same reason an unavailable alert feed is.
    """
    scanner = os.path.join(path, "scripts", "scan-secrets.mjs")
    if not os.path.exists(scanner):
        return {"ran": False, "why": "this repository does not carry scripts/scan-secrets.mjs"}

    # The tip has not moved, so neither has the answer. The scan is cheap but it
    # is not free, and this runs once a minute for as long as the box is up.
    # Checked before node is looked for on purpose: whether node happens to be
    # installed this minute has no bearing on what a scan of this exact commit
    # already found.
    if isinstance(was, dict) and was.get("head") == head and was.get("ran"):
        return was

    node = shutil.which("node")
    if not node:
        return {"ran": False, "why": "no node on this box, so the scanner could not be run"}

    span = scan_range(path)
    if span is None:
        return {"ran": False, "why": "no commits to read"}

    try:
        done = subprocess.run(
            (node, scanner, "--json", span),
            cwd=path,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
        )
    except (OSError, subprocess.SubprocessError):
        return {"ran": False, "why": "the scanner could not be started"}

    try:
        answer = json.loads(done.stdout or "{}")
    except ValueError:
        return {"ran": False, "why": "the scanner did not answer in JSON"}
    if not isinstance(answer, dict) or answer.get("error"):
        return {"ran": False, "why": answer.get("error") if isinstance(answer, dict) else "unreadable"}

    findings = [row for row in answer.get("findings") or [] if isinstance(row, dict)]
    return {
        "ran": True,
        "head": head,
        "at": now(),
        "range": answer.get("range"),
        "files": answer.get("files"),
        "lines": answer.get("lines"),
        "allowlisted": answer.get("allowlistedCount") or 0,
        "clean": len(findings) == 0,
        # The findings carry a fingerprint and a place, never the value. This
        # file is world-readable by the admin group; a list of real credentials
        # in it would be a worse leak than the one it is reporting.
        "findings": findings[:MAX_ALERTS],
    }


def scanner_rules(path, was):
    """What the scanner in this checkout knows how to spot.

    Asked of the scanner rather than listed here, so the panel names what
    actually shipped. A list kept in two places is a list that disagrees with
    itself the first time somebody adds a rule.
    """
    scanner = os.path.join(path, "scripts", "scan-secrets.mjs")
    node = shutil.which("node")
    if not os.path.exists(scanner) or not node:
        return was if isinstance(was, list) else []
    try:
        done = subprocess.run(
            (node, scanner, "--rules"), cwd=path, capture_output=True, text=True, timeout=TIMEOUT
        )
        rules = json.loads(done.stdout or "[]")
    except (OSError, subprocess.SubprocessError, ValueError):
        return was if isinstance(was, list) else []
    return [row for row in rules if isinstance(row, dict)] if isinstance(rules, list) else []


def count_allowlist(path):
    try:
        with open(os.path.join(path, ".githooks", "allowed-secrets"), "r", encoding="utf-8") as handle:
            return sum(
                1 for line in handle if line.strip() and not line.strip().startswith("#")
            )
    except OSError:
        return None


def guards(path, head, known):
    """What is actually standing between a credential and this box.

    Every line here is checked rather than assumed, because the interesting
    failure is a guard that is present and switched off. The one thing this
    cannot see is whether the people who push have enabled the hook in their own
    clones — the hook runs there, not here — so it reports what the repository
    ships and says plainly that enabling it is per-clone.
    """
    hook = os.path.join(path, ".githooks", "pre-push")
    scanner = os.path.join(path, "scripts", "scan-secrets.mjs")
    dist = os.path.join(path, "scripts", "check-dist-secrets.mjs")
    hooks_path = git(path, "config", "core.hooksPath")

    return {
        "prePush": {
            "shipped": os.path.exists(hook),
            "executable": os.path.exists(hook) and os.access(hook, os.X_OK),
            # True only of this box's own checkout, which never pushes. It is
            # reported because it is checkable and because a developer reading
            # the panel can compare it against their own clone.
            "hooksPath": hooks_path or None,
            "enabledHere": hooks_path == ".githooks",
        },
        "scanner": {
            "shipped": os.path.exists(scanner),
            "allowlisted": count_allowlist(path),
            "rules": scanner_rules(path, ((known or {}).get("guards") or {}).get("scanner", {}).get("rules")),
        },
        "build": {
            # Runs at postbuild, so nothing reaches the web root without it.
            "distCheck": os.path.exists(dist),
        },
        "scan": local_scan(path, head, (known or {}).get("scan")),
    }


def detail_for(api, repo, cached):
    facts = repo_facts(api, repo, cached.get("facts") or {})
    pulls = open_pulls(api, repo, cached.get("pulls"))
    history = pull_history(api, repo, cached.get("history"))
    issues = open_issues(api, repo, cached.get("issues"))
    commits = recent_commits(api, repo, cached.get("commits"))
    branches = branch_drift(api, repo, facts.get("defaultBranch"), cached.get("branches"))
    runs = recent_runs(api, repo, cached.get("runs"))
    access = repo_access(api, repo, cached.get("access"))
    invites = repo_invites(api, repo, cached.get("invites"))
    stats = contributions(api, repo, cached.get("stats"))
    punch = punch_card(api, repo, cached.get("punch"))
    alerts = security_alerts(api, repo, cached.get("alerts"))
    return {
        "facts": facts,
        "pulls": pulls,
        "history": history,
        "issues": issues,
        "commits": commits,
        "branches": branches,
        "runs": runs,
        "access": access,
        "invites": invites,
        "stats": stats,
        "punch": punch,
        "alerts": alerts,
    }


# ------------------------------------------------------------------- people

# Who can reach the code, and how.
#
# Two different things wear the word "permission" here and they are kept apart
# on purpose. An organisation role — owner or member — is about the
# organisation. A repository role — read through admin — is about one
# repository. Somebody can hold a repository at admin without being an owner,
# and an owner holds every repository whether or not they were ever added to
# one. The second case is the one that surprises people, so access records where
# it came from and not only what it is.


def person(entry, **extra):
    if not isinstance(entry, dict) or not entry.get("login"):
        return None
    out = {
        "login": entry.get("login"),
        "avatar": entry.get("avatar_url"),
        "url": entry.get("html_url"),
        "type": entry.get("type") or "User",
    }
    out.update(extra)
    return out


def people_list(payload, **extra):
    if not isinstance(payload, list):
        return None
    out = []
    for entry in payload[:MAX_PEOPLE]:
        made = person(entry, **extra)
        if made:
            out.append(made)
    return out


def actor_login(api, cached):
    """The account the token belongs to.

    Not decoration. It is the one account a queued change is never allowed to
    touch: revoking its own admin would lock this box out of the repository, and
    out of the deploy that would have put it back.
    """
    payload, state = api.get("/user", bool(cached))
    if state != "ok" or not isinstance(payload, dict):
        return cached
    return payload.get("login") or cached


def repo_access(api, repo, cached):
    """Everyone who can reach one repository, and whether they were added to it.

    Two questions, so two requests. `all` is who has access by any route;
    `direct` is who was added to this repository specifically. Only the second
    kind can be changed from here — an owner's access comes from the
    organisation, and taking it away means changing their organisation role,
    which is a different decision made somewhere else.
    """
    # isinstance rather than a truth test, throughout. An empty list is an
    # answer — "nobody has been added to this repository" — and treating it as
    # nothing known means asking again in full every tick for the state these
    # repositories are actually in.
    held = isinstance(cached, list)
    everyone, state = api.get(
        "/repos/%s/%s/collaborators?affiliation=all&per_page=100" % (ORG, repo), held
    )
    if state != "ok":
        return cached if held else []
    listed = people_list(everyone)
    if listed is None:
        return cached if held else []

    roles = {}
    for entry in everyone:
        if isinstance(entry, dict) and entry.get("login"):
            roles[entry["login"]] = entry.get("role_name")

    added, direct_state = api.get(
        "/repos/%s/%s/collaborators?affiliation=direct&per_page=100" % (ORG, repo), held
    )
    if direct_state == "ok" and isinstance(added, list):
        direct = set(e.get("login") for e in added if isinstance(e, dict))
    else:
        # Carried from last time rather than guessed at. Guessing "not direct"
        # greys out a control that does work; guessing "direct" offers one that
        # cannot.
        direct = set(
            e.get("login") for e in (cached or []) if isinstance(e, dict) and e.get("direct")
        )

    for row in listed:
        row["role"] = roles.get(row["login"])
        row["direct"] = row["login"] in direct
    listed.sort(
        key=lambda row: (
            -ROLES.index(row["role"]) if row.get("role") in ROLES else 0,
            row["login"],
        )
    )
    return listed


def repo_invites(api, repo, cached):
    """Invitations sent for this repository that nobody has accepted yet.

    Worth a list of their own. An invitation is access that has been decided on
    and has not happened, and one that has sat unanswered for weeks usually
    means it went to the wrong person.
    """
    payload, state = api.get(
        "/repos/%s/%s/invitations?per_page=100" % (ORG, repo), isinstance(cached, list)
    )
    if state != "ok" or not isinstance(payload, list):
        return cached if isinstance(cached, list) else []
    out = []
    for entry in payload[:MAX_PEOPLE]:
        if not isinstance(entry, dict):
            continue
        invitee = entry.get("invitee") if isinstance(entry.get("invitee"), dict) else {}
        inviter = entry.get("inviter") if isinstance(entry.get("inviter"), dict) else {}
        out.append(
            {
                "id": entry.get("id"),
                "login": invitee.get("login"),
                "avatar": invitee.get("avatar_url"),
                # GitHub calls this "permissions" on an invitation and
                # "role_name" on a collaborator, and spells the same level
                # differently in each.
                "permission": entry.get("permissions"),
                "created": entry.get("created_at"),
                "expired": bool(entry.get("expired")),
                "by": inviter.get("login"),
                "url": entry.get("html_url"),
            }
        )
    return out


def org_people(api, cached):
    """The organisation itself: its members, its settings, its open invitations.

    Members come back from two role-filtered requests rather than one list plus
    a membership lookup per person. That is two requests however many people
    there are, which matters less today than it will later.
    """
    held = cached if isinstance(cached, dict) else {}
    out = dict(held)

    facts, state = api.get("/orgs/%s" % ORG, bool(held.get("org")))
    if state == "ok" and isinstance(facts, dict):
        plan = facts.get("plan") if isinstance(facts.get("plan"), dict) else {}
        out["org"] = {
            "login": facts.get("login"),
            "name": facts.get("name"),
            "url": facts.get("html_url"),
            "created": facts.get("created_at"),
            "plan": plan.get("name"),
            "seatsFilled": plan.get("filled_seats"),
            "seats": plan.get("seats"),
            # The three settings that decide what a new member gets without
            # anybody deciding it again.
            "twoFactorRequired": bool(facts.get("two_factor_requirement_enabled")),
            "defaultPermission": facts.get("default_repository_permission"),
            "membersCanCreateRepos": facts.get("members_can_create_repositories"),
            "membersCanForkPrivate": facts.get("members_can_fork_private_repositories"),
            "privateRepos": facts.get("total_private_repos"),
            "outsideCollaborators": facts.get("collaborators"),
        }

    members = []
    seen = set()
    answered = False
    for role in ("admin", "member"):
        payload, state = api.get(
            "/orgs/%s/members?role=%s&per_page=100" % (ORG, role), "members" in held
        )
        if state != "ok":
            continue
        answered = True
        # GitHub's word for it is "admin". Everywhere a person reads it, it is
        # "owner", so it is translated once here rather than in three places.
        for row in people_list(payload, role="owner" if role == "admin" else "member") or []:
            if row["login"] not in seen:
                seen.add(row["login"])
                members.append(row)
    if answered:
        out["members"] = members
    elif "members" not in out:
        out["members"] = []

    weak, state = api.get(
        "/orgs/%s/members?filter=2fa_disabled&per_page=100" % ORG, "withoutTwoFactor" in held
    )
    if state == "ok" and isinstance(weak, list):
        out["withoutTwoFactor"] = [row["login"] for row in people_list(weak) or []]

    invites, state = api.get("/orgs/%s/invitations?per_page=100" % ORG, "invites" in held)
    if state == "ok" and isinstance(invites, list):
        rows = []
        for entry in invites[:MAX_PEOPLE]:
            if not isinstance(entry, dict):
                continue
            inviter = entry.get("inviter") if isinstance(entry.get("inviter"), dict) else {}
            rows.append(
                {
                    "login": entry.get("login"),
                    "email": entry.get("email"),
                    "role": entry.get("role"),
                    "created": entry.get("created_at"),
                    "failed": entry.get("failed_reason"),
                    "by": inviter.get("login"),
                }
            )
        out["invites"] = rows

    return out


# ------------------------------------------------------------- carrying it out

def read_intent(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def refuse(intent, why):
    return dict(intent, ok=False, done=now(), error=why, status=None)


def check_intent(intent, repos, actor):
    """Whether a queued change is one we are willing to make.

    Checked here in full, and not because the panel did not check it — it did.
    The panel is not what this trusts. The queue is a directory written by a
    service running as another account; if that account were ever taken, this
    function is the whole of what stands between it and handing somebody admin.
    """
    if intent.get("action") not in ("grant", "revoke", "uninvite"):
        return "not something this knows how to do"

    repo = intent.get("repo")
    if repo not in repos:
        return "%s is not a repository on this box" % (repo or "that")

    if intent["action"] == "uninvite":
        invite = intent.get("invite")
        if not isinstance(invite, int) or isinstance(invite, bool):
            return "no invitation was named"
        return None

    login = intent.get("login")
    if not isinstance(login, str) or not LOGIN.match(login):
        return "%r is not a GitHub login" % (login,)
    if actor and login.lower() == actor.lower():
        # The rail that matters. Revoking this account's own admin locks the box
        # out of the repository, and out of the deploy that would undo it.
        return "that is the account this box deploys with — change it on GitHub if you mean it"

    if intent["action"] == "grant" and intent.get("permission") not in ROLES:
        return "%r is not a permission GitHub takes" % (intent.get("permission"),)
    return None


def carry_out(api, intent):
    repo = intent["repo"]
    action = intent["action"]

    if action == "grant":
        payload, status, error = api.send(
            "PUT",
            "/repos/%s/%s/collaborators/%s" % (ORG, repo, intent["login"]),
            {"permission": intent["permission"]},
        )
        # 201 with a body means an invitation was created and is waiting to be
        # accepted. 204 and no body means they already had access and only the
        # level moved. Worth telling apart: one of them is not access yet.
        result = None
        if error is None:
            result = "invited" if isinstance(payload, dict) and payload.get("id") else "changed"
        return dict(intent, ok=error is None, done=now(), status=status, error=error, result=result)

    if action == "revoke":
        payload, status, error = api.send(
            "DELETE", "/repos/%s/%s/collaborators/%s" % (ORG, repo, intent["login"])
        )
        return dict(
            intent, ok=error is None, done=now(), status=status, error=error, result="removed"
        )

    payload, status, error = api.send(
        "DELETE", "/repos/%s/%s/invitations/%d" % (ORG, repo, intent["invite"])
    )
    return dict(
        intent, ok=error is None, done=now(), status=status, error=error, result="cancelled"
    )


def drain_queue(api, repos, actor, previous):
    """Carry out what the panel has asked for, then record what happened.

    Every intent leaves the queue whether it worked or not. A failure is not
    retried on its own: a login that does not exist, or a permission GitHub will
    not take, fails identically every minute, and a loop nobody can see is worse
    than a refusal somebody can read. What happened goes into the snapshot
    instead, where the person who asked for it will be looking.
    """
    done = []
    try:
        names = sorted(name for name in os.listdir(QUEUE_DIR) if name.endswith(".json"))
    except OSError:
        return previous

    for name in names[:MAX_QUEUE_PER_TICK]:
        path = os.path.join(QUEUE_DIR, name)
        intent = read_intent(path)
        try:
            os.unlink(path)
        except OSError:
            pass
        if intent is None:
            continue

        why = check_intent(intent, repos, actor)
        done.append(refuse(intent, why) if why else carry_out(api, intent))

    if not done:
        return previous

    kept = previous if isinstance(previous, list) else []
    return (list(reversed(done)) + kept)[:MAX_ACTION_LOG]


# ---------------------------------------------------------------- assembling

# ------------------------------------------------------- which commit did it

def read_jsonl(path, limit):
    """The last `limit` records of a JSON-lines file, oldest first.

    Read whole and sliced rather than seeked from the end: both files are
    written by replacing them atomically, so what is open here is a consistent
    snapshot for as long as it is held, and neither is large enough for the
    difference to matter. An unreadable line is dropped rather than fatal —
    losing one measurement is not a reason to leave the panel with none.
    """
    out = []
    try:
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.read().splitlines()
    except OSError:
        return out
    for line in lines[-limit:]:
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict):
            out.append(entry)
    return out


def middle(values):
    """The median, because one slow run should not redraw a release.

    A measurement taken while the box was doing something else is not a wrong
    reading — the page really did take that long — but it is not the release's
    doing either, and a mean lets one of them speak for all of them.
    """
    ordered = sorted(values)
    if not ordered:
        return None
    half = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[half]
    return (ordered[half - 1] + ordered[half]) / 2


def round_metric(name, value):
    if value is None:
        return None
    if name == "cls":
        return round(value, 4)
    return int(round(value))


def pull_from_subject(subject):
    hit = PULL_IN_SUBJECT.search(subject or "")
    return int(hit.group(1)) if hit else None


def measured_pages(runs):
    """Every route these runs touched, each metric the middle of what was seen.

    Kept per route rather than averaged into one number for the site. "The site
    got slower" is not something anybody can act on; "/ got slower and /work did
    not" points at what changed.
    """
    by_path = {}
    for run in runs:
        for page in run.get("pages") or []:
            if not isinstance(page, dict):
                continue
            path = page.get("path")
            if not isinstance(path, str) or not path:
                continue
            held = by_path.setdefault(path, {name: [] for name in PERF_METRICS})
            for name in PERF_METRICS:
                value = page.get(name)
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    held[name].append(value)

    out = []
    for path in sorted(by_path):
        entry = {"path": path}
        for name in PERF_METRICS:
            entry[name] = round_metric(name, middle(by_path[path][name]))
        out.append(entry)
    return out


def metric_moves(now, before):
    """What moved between two releases, per route and metric, both directions.

    Improvements are kept alongside regressions. The question the panel exists
    to answer cuts both ways — a release that was supposed to make the site
    faster and did nothing is worth seeing, and so is the fix that worked.
    """
    was = {page["path"]: page for page in before}
    out = []
    for page in now:
        previous = was.get(page["path"])
        if previous is None:
            continue
        for name in PERF_METRICS:
            start, end = previous.get(name), page.get(name)
            if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
                continue
            # A zero is a real reading for the metrics that count something the
            # page may simply not have done — blocking time, bytes past a
            # budget. For a paint timing it means the measurement did not
            # happen, and reporting that as an infinite improvement would be a
            # lie in the flattering direction.
            if name in ("lcp", "fcp", "ttfb") and (not start or not end):
                continue
            change = end - start
            if abs(change) < PERF_FLOOR.get(name, 0):
                continue
            if abs(change) < abs(start) * PERF_FRACTION:
                continue
            out.append(
                {
                    "path": page["path"],
                    "metric": name,
                    "from": round_metric(name, start),
                    "to": round_metric(name, end),
                    "delta": round_metric(name, change),
                    # How bad it is, in noise floors, so that 340 of
                    # milliseconds and 0.05 of layout shift can be compared at
                    # all — sorting on the raw number would put every
                    # millisecond metric above every CLS one for ever.
                    #
                    # Worked out here and carried rather than left for the panel
                    # to derive, so that the order of a release's own list and
                    # the headline picked out across all of them cannot end up
                    # disagreeing about which was the worst thing that happened.
                    "weight": round(change / (PERF_FLOOR.get(name) or 1), 2),
                }
            )
    # Regressions first, worst of them at the front, then the improvements with
    # the biggest of those at the front. Sorting on the signed weight alone put
    # the *smallest* improvement first on a release that only made things
    # better, which reads as the least interesting thing it did.
    out.sort(key=lambda move: (move["weight"] <= 0, -abs(move["weight"])))
    return out


def site_performance(repositories):
    """Join what was measured to the commit that was live when it was measured.

    Three files and none of them alone can answer the question. The monitor
    records numbers and the release that was serving. The deploy records which
    commit each release is. This process is already holding the commits and the
    pull requests they arrived in. Nothing new is asked of GitHub for any of it.

    What comes out is a release at a time, newest measurement first, each with
    the middle of every reading taken while it was live and what that moved
    against the release measured before it. A release with no measurement is not
    listed: it was deployed and replaced inside a measurement's reach, and
    inventing a reading for it would put a commit's name against numbers that
    belong to its neighbour.
    """
    runs = read_jsonl(PERF_HISTORY, MAX_PERF_RUNS)
    if not runs:
        return {
            "measured": None,
            "releases": [],
            "note": "no measurement has been taken on this box yet",
        }

    # One profile at a time. A throttled run against an unthrottled one compares
    # the emulation rather than the code, and the difference between them is far
    # larger than any regression worth finding. The newest run's profile wins,
    # because that is the one the timer is set to.
    profile = runs[-1].get("profile")
    runs = [run for run in runs if run.get("profile") == profile]

    ledger = {
        entry["release"]: entry
        for entry in read_jsonl(RELEASE_LEDGER, MAX_PERF_RELEASES * 4)
        if isinstance(entry.get("release"), str)
    }

    by_release = {}
    dateless = 0
    for run in runs:
        release = run.get("release")
        name = release.get("release") if isinstance(release, dict) else None
        if not isinstance(name, str) or not name:
            # Measured before any of this existed, or while the symlink could
            # not be read. Counted so the panel can say why its history is
            # shorter than the monitor's.
            dateless += 1
            continue
        by_release.setdefault(name, []).append(run)

    # Newest last measurement first. Not by release name, which is the time it
    # was built: a rollback re-points the symlink at an older release, and it is
    # what is serving now that belongs at the top.
    order = sorted(
        by_release,
        key=lambda name: max(str(run.get("at") or "") for run in by_release[name]),
        reverse=True,
    )[:MAX_PERF_RELEASES]

    site = next((repo for repo in repositories if repo.get("name") == PERF_REPO), {})
    commits = {
        str(commit.get("sha") or "")[:7]: commit
        for commit in (site.get("commits") or [])
        if isinstance(commit, dict) and commit.get("sha")
    }
    pulls = {
        pull["number"]: pull
        for pull in (site.get("history") or [])
        if isinstance(pull, dict) and isinstance(pull.get("number"), int)
    }

    entries = []
    for name in order:
        group = sorted(by_release[name], key=lambda run: str(run.get("at") or ""))
        recorded = ledger.get(name) or {}
        sha = recorded.get("sha")
        short = sha[:7] if isinstance(sha, str) else None
        commit = commits.get(short) if short else None
        subject = recorded.get("subject") or (commit or {}).get("subject")
        number = pull_from_subject(subject)
        pull = pulls.get(number) if number is not None else None

        entry = {
            "release": name,
            "sha": sha,
            "short": short,
            "subject": subject,
            "author": recorded.get("author") or (commit or {}).get("author"),
            "login": (commit or {}).get("login"),
            "committed": recorded.get("committed"),
            "commitUrl": (commit or {}).get("url"),
            # A release built from a checkout with uncommitted changes in it is
            # not the commit it names. Carried through so the panel can decline
            # to blame anybody for it rather than blaming the wrong person.
            "dirty": bool(recorded.get("dirty")),
            "runs": len(group),
            "first": group[0].get("at"),
            "last": group[-1].get("at"),
            "pages": measured_pages(group),
            # The newest run's verdict, not every run's: the older ones were
            # answering about a site that has since been redeployed.
            "problems": [p for p in (group[-1].get("problems") or []) if isinstance(p, str)],
        }
        if pull is not None:
            entry["pull"] = {
                "number": pull.get("number"),
                "title": pull.get("title"),
                "author": pull.get("author"),
                "merged": pull.get("merged"),
                "url": pull.get("url"),
            }
        elif number is not None:
            # The subject names a pull request the collector's window no longer
            # reaches back to. The number is still the useful half.
            entry["pull"] = {"number": number}
        entries.append(entry)

    # The chain, walked after the fact: each release against the one measured
    # before it. Done here rather than in the loop because "the previous one"
    # only means anything once the order is settled.
    for index, entry in enumerate(entries):
        older = entries[index + 1] if index + 1 < len(entries) else None
        if older is None:
            continue
        entry["against"] = {"release": older["release"], "short": older.get("short")}
        entry["moves"] = metric_moves(entry["pages"], older["pages"])

    return {
        "measured": runs[-1].get("at"),
        "profile": profile,
        "release": entries[0]["release"] if entries else None,
        "releases": entries,
        "unattributed": dateless,
        "metrics": list(PERF_METRICS),
    }


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
                "guards": None,
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
                # Local, so it is worked out every tick rather than only on a
                # detail round: it costs a few stats and a scan that skips
                # itself when the tip has not moved.
                "guards": guards(path, head, known),
            }
        )
        if remote and remote != head:
            entry["tip"] = commit_facts(path, "origin/%s" % BRANCH)

    # Everything GitHub answered for last time. Two jobs, and the second is the
    # one that bites: it is what a conditional request falls back on, so a key
    # missing from this list is re-asked in full every tick and thrown away
    # whenever GitHub cannot be reached. Anything detail_for returns belongs
    # here.
    carried = {
        key: known[key]
        for key in (
            "facts",
            "pulls",
            "history",
            "issues",
            "commits",
            "branches",
            "runs",
            "access",
            "invites",
            "stats",
            "punch",
            "alerts",
        )
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

    held_people = previous.get("people") if isinstance(previous.get("people"), dict) else {}
    actor = actor_login(api, held_people.get("actor")) if auth else held_people.get("actor")

    # Whatever the panel asked for is carried out before anything is read, so
    # the snapshot written at the end of this tick shows the result rather than
    # the state it replaced. Having carried something out is also reason enough
    # to ask GitHub everything again however recently it was last asked: the
    # person who asked for it is watching the page.
    actions = held_people.get("actions")
    carried = 0
    if auth:
        after = drain_queue(api, set(name for name, _ in pairs), actor, actions)
        if after is not actions:
            carried = len(after or []) - len(actions or [])
            want_detail = True
        actions = after

    repositories = []
    for name, path in pairs:
        repositories.append(inspect(name, path, api, cached(previous, name), want_detail))

    people = org_people(api, held_people) if (want_detail and auth) else dict(held_people)
    people["actor"] = actor
    if actions:
        people["actions"] = actions
    else:
        people.pop("actions", None)

    payload = {
        "generated": now(),
        "org": ORG,
        "branch": BRANCH,
        "repositories": repositories,
        "people": people,
        "etags": api.etags,
    }

    # Read from disk rather than asked of GitHub, so it costs nothing off the
    # rate limit and is redone every tick regardless of whether the detail pass
    # ran. Never fatal: a box with no performance monitor on it still has three
    # repositories worth reporting.
    try:
        payload["performance"] = site_performance(repositories)
    except (OSError, ValueError, TypeError, KeyError) as failure:
        payload["performance"] = {
            "measured": None,
            "releases": [],
            "note": "could not read the performance history: %s" % failure,
        }
    # Only GitHub being out of reach holds this stamp back, and only because it
    # is the one case where part of this snapshot really did come from an
    # earlier look. A refusal is an answer: it arrived just now, and pinning the
    # stamp for it left the panel reporting a ten-minute-old look every minute,
    # for ever, on a box that was asking GitHub and being told no on schedule.
    payload["detail"] = now() if want_detail and not api.unreachable else previous.get("detail")
    if api.remaining is not None:
        payload["rate"] = {"remaining": api.remaining, "limit": api.limit, "reset": api.reset}
    if not auth:
        payload["note"] = "no GitHub token on this box — nothing could be asked of GitHub"
    elif api.unreachable:
        payload["note"] = "GitHub could not be reached in full; some of this may be from an earlier look"
    elif api.refused:
        # Everything asked for was answered; some of the answers were no, and
        # not a no the caller was expecting. Named rather than counted, because
        # one path refused is a thing to go and look at and "3 requests" is not.
        paths = ", ".join("%s (%d)" % (path, code) for path, code in api.refused[:3])
        payload["note"] = "GitHub refused %d request(s) this look: %s%s" % (
            len(api.refused), paths, " …" if len(api.refused) > 3 else ""
        )

    try:
        write_atomic(out_path, payload)
    except OSError as failure:
        print("could not write %s: %s" % (out_path, failure), file=sys.stderr)
        return 1

    clean = sum(1 for entry in repositories if entry.get("synced") and not entry.get("dirty"))
    pulls = sum(len(entry.get("pulls") or []) for entry in repositories)
    issues = sum(len(entry.get("issues") or []) for entry in repositories)
    print(
        "github state: %d/%d in sync and clean, %d open PR(s), %d open issue(s)%s; %d request(s), %d charged%s"
        % (clean, len(repositories), pulls, issues,
           "" if carried <= 0 else ", %d access change(s) carried out" % carried,
           api.calls, api.spent,
           "" if api.remaining is None else ", %d left this hour" % api.remaining)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
