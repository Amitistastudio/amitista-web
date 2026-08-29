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
MAX_FILES = 40
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
QUEUE_DIR = os.environ.get("ADMIN_GITHUB_QUEUE", "/var/lib/amitista/admin/github-queue")
MAX_QUEUE_PER_TICK = 20
MAX_ACTION_LOG = 25

# The permissions GitHub takes for a repository collaborator, weakest first.
ROLES = ("pull", "triage", "push", "maintain", "admin")

# Teams. The nearest thing to a role you name yourself that this plan has:
# GitHub's own custom repository roles answer 404 here — "Feature not available
# for the Amitistastudio organization" — because they need a paid plan. A team
# cannot invent a sixth level, but it can hold a different one of the five on
# each repository and be handed to somebody in one move, which is what the
# question is usually really about.
MAX_TEAMS = 20
TEAM_NAME_MAX = 100
# GitHub slugifies a team's name into this and then addresses the team by it.
TEAM_SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]{0,98}$")
TEAM_DESC_MAX = 255
TEAM_ROLES = ("member", "maintainer")

# Everything the queue is allowed to ask for. Named in one place so that adding
# a verb to carry_out without deciding how to check it is not possible.
ACTIONS = (
    "grant",
    "revoke",
    "uninvite",
    "team-create",
    "team-delete",
    "team-repo",
    "team-repo-remove",
    "team-member",
    "team-member-remove",
)

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
            reason = "GitHub refused it (%d)" % failure.code
            try:
                said = json.loads(failure.read())
                if isinstance(said, dict) and said.get("message"):
                    reason = said["message"]
                    errors = said.get("errors")
                    if isinstance(errors, list) and errors:
                        first = errors[0]
                        if isinstance(first, dict) and first.get("message"):
                            reason = "%s — %s" % (reason, first["message"])
            except (ValueError, OSError):
                pass
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


def detail_for(api, repo, cached):
    facts = repo_facts(api, repo, cached.get("facts") or {})
    pulls = open_pulls(api, repo, cached.get("pulls"))
    issues = open_issues(api, repo, cached.get("issues"))
    commits = recent_commits(api, repo, cached.get("commits"))
    branches = branch_drift(api, repo, facts.get("defaultBranch"), cached.get("branches"))
    runs = recent_runs(api, repo, cached.get("runs"))
    access = repo_access(api, repo, cached.get("access"))
    invites = repo_invites(api, repo, cached.get("invites"))
    return {
        "facts": facts,
        "pulls": pulls,
        "issues": issues,
        "commits": commits,
        "branches": branches,
        "runs": runs,
        "access": access,
        "invites": invites,
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


def org_teams(api, cached):
    """Every team, who is in it, and what it can reach.

    Two requests a team, both conditional, so a team nobody has touched costs
    round trips and nothing off the allowance. Capped, because the cost is per
    team and an organisation can have a great many.

    A team's repositories carry `role_name`, the same display vocabulary a
    collaborator's does — read and write, not pull and push.
    """
    held = cached if isinstance(cached, list) else None
    known = {
        entry.get("slug"): entry
        for entry in (held or [])
        if isinstance(entry, dict)
    }
    listing, state = api.get("/orgs/%s/teams?per_page=100" % ORG, held is not None)

    if state == "ok" and isinstance(listing, list):
        rows = [
            {
                "slug": entry["slug"],
                "name": entry.get("name"),
                "description": entry.get("description"),
                "privacy": entry.get("privacy"),
                "url": entry.get("html_url"),
                "parent": (entry.get("parent") or {}).get("slug")
                if isinstance(entry.get("parent"), dict)
                else None,
            }
            for entry in listing[:MAX_TEAMS]
            if isinstance(entry, dict) and entry.get("slug")
        ]
    elif held is not None:
        # The list's ETag settles whether a team was made, renamed or removed.
        # It says nothing about what a team can reach or who is in it: putting a
        # repository on a team does not touch the team's own record, so the list
        # goes on answering 304 and the reach would never update. Measured, not
        # guessed — a team given two repositories went on reading as reaching
        # nothing until this stopped returning early.
        rows = [
            {key: value for key, value in team.items() if key not in ("members", "repos")}
            for team in held
            if isinstance(team, dict) and team.get("slug")
        ]
    else:
        return []

    out = []
    for row in rows:
        slug = row["slug"]
        was = known.get(slug) or {}

        members, member_state = api.get(
            "/orgs/%s/teams/%s/members?per_page=100" % (ORG, slug), "members" in was
        )
        listed = people_list(members) if member_state == "ok" else None
        row["members"] = listed if listed is not None else (was.get("members") or [])

        repos, repo_state = api.get(
            "/orgs/%s/teams/%s/repos?per_page=100" % (ORG, slug), "repos" in was
        )
        if repo_state == "ok" and isinstance(repos, list):
            row["repos"] = [
                {"name": item.get("name"), "permission": item.get("role_name")}
                for item in repos
                if isinstance(item, dict) and item.get("name")
            ]
        else:
            row["repos"] = was.get("repos") or []

        out.append(row)
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

    out["teams"] = org_teams(api, held.get("teams"))

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
    action = intent.get("action")
    if action not in ACTIONS:
        return "not something this knows how to do"

    # Anything naming a person. The rail that matters: taking this account's own
    # access away locks the box out of the repository, and out of the deploy
    # that would undo it.
    if action in ("grant", "revoke", "team-member", "team-member-remove"):
        login = intent.get("login")
        if not isinstance(login, str) or not LOGIN.match(login):
            return "%r is not a GitHub login" % (login,)
        if actor and login.lower() == actor.lower() and action != "grant":
            return "that is the account this box deploys with — change it on GitHub if you mean it"

    # Anything naming a repository. A team's repositories are the same set: this
    # box will not put a team on a repository it does not itself deploy.
    if action in ("grant", "revoke", "uninvite", "team-repo", "team-repo-remove"):
        repo = intent.get("repo")
        if repo not in repos:
            return "%s is not a repository on this box" % (repo or "that")

    # Anything naming an existing team. The slug goes into a URL path, so it is
    # held to the shape GitHub slugifies a name into. Creating one is the
    # exception: there is no slug yet, GitHub makes it from the name.
    if action.startswith("team-") and action != "team-create":
        team = intent.get("team")
        if not isinstance(team, str) or not TEAM_SLUG.match(team):
            return "%r is not a team" % (team,)

    if action in ("grant", "team-repo") and intent.get("permission") not in ROLES:
        return "%r is not a permission GitHub takes" % (intent.get("permission"),)

    if action == "uninvite":
        invite = intent.get("invite")
        if not isinstance(invite, int) or isinstance(invite, bool):
            return "no invitation was named"

    if action == "team-create":
        name = intent.get("name")
        if not isinstance(name, str) or not name.strip():
            return "a team needs a name"
        if len(name) > TEAM_NAME_MAX:
            return "that name is longer than GitHub will take"
        if any(character in name for character in "\r\n\t"):
            return "a team name cannot span lines"

    if action == "team-member" and intent.get("role") not in TEAM_ROLES:
        return "%r is not a team role" % (intent.get("role"),)

    return None


def carry_out(api, intent):
    action = intent["action"]

    if action.startswith("team-"):
        return carry_out_team(api, intent)

    repo = intent["repo"]

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


def carry_out_team(api, intent):
    """The team half. Split out because it is six verbs against four endpoints.

    Team membership is the one that does something you might not expect: on an
    account that is not in the organisation yet, GitHub turns it into an
    invitation to join both, so the answer is "invited" rather than "added" and
    nothing happens until they accept.
    """
    action = intent["action"]
    team = intent.get("team")
    finish = lambda payload, status, error, result: dict(  # noqa: E731
        intent, ok=error is None, done=now(), status=status, error=error, result=result
    )

    if action == "team-create":
        payload, status, error = api.send(
            "POST",
            "/orgs/%s/teams" % ORG,
            {
                "name": intent["name"].strip(),
                "description": (intent.get("description") or "")[:TEAM_DESC_MAX],
                # Visible to everyone in the organisation. A secret team cannot
                # be seen by the people it does not contain, which makes the
                # panel's own picture of who can reach what quietly incomplete.
                "privacy": "closed",
            },
        )
        made = payload.get("slug") if isinstance(payload, dict) else None
        return finish(payload, status, error, "created %s" % made if made else "created")

    if action == "team-delete":
        payload, status, error = api.send("DELETE", "/orgs/%s/teams/%s" % (ORG, team))
        return finish(payload, status, error, "deleted")

    if action == "team-repo":
        payload, status, error = api.send(
            "PUT",
            "/orgs/%s/teams/%s/repos/%s/%s" % (ORG, team, ORG, intent["repo"]),
            {"permission": intent["permission"]},
        )
        return finish(payload, status, error, "set")

    if action == "team-repo-remove":
        payload, status, error = api.send(
            "DELETE", "/orgs/%s/teams/%s/repos/%s/%s" % (ORG, team, ORG, intent["repo"])
        )
        return finish(payload, status, error, "unset")

    if action == "team-member":
        payload, status, error = api.send(
            "PUT",
            "/orgs/%s/teams/%s/memberships/%s" % (ORG, team, intent["login"]),
            {"role": intent["role"]},
        )
        pending = isinstance(payload, dict) and payload.get("state") == "pending"
        return finish(payload, status, error, "invited" if pending else "added")

    payload, status, error = api.send(
        "DELETE", "/orgs/%s/teams/%s/memberships/%s" % (ORG, team, intent["login"])
    )
    return finish(payload, status, error, "removed")


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

    # Everything GitHub answered for last time. Two jobs, and the second is the
    # one that bites: it is what a conditional request falls back on, so a key
    # missing from this list is re-asked in full every tick and thrown away
    # whenever GitHub cannot be reached. Anything detail_for returns belongs
    # here.
    carried = {
        key: known[key]
        for key in ("facts", "pulls", "issues", "commits", "branches", "runs", "access", "invites")
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
        "github state: %d/%d in sync and clean, %d open PR(s), %d open issue(s)%s; %d request(s), %d charged%s"
        % (clean, len(repositories), pulls, issues,
           "" if carried <= 0 else ", %d access change(s) carried out" % carried,
           api.calls, api.spent,
           "" if api.remaining is None else ", %d left this hour" % api.remaining)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
