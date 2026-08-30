#!/usr/bin/env python3

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

DETAIL_SECONDS = int(os.environ.get("AUTODEPLOY_GITHUB_DETAIL_SECONDS", "60"))

MAX_PULLS = 20
MAX_PULL_DETAIL = 10
MAX_PULL_HISTORY = 60
MAX_HISTORY_DETAIL = 15
MAX_REVIEWS = 100
MAX_FILES = 40
MAX_PATCH_CHARS = 4000
MAX_PATCH_TOTAL = 48000
MAX_ISSUES = 30
MAX_COMMITS = 40
MAX_BODY = 1200
MAX_BRANCHES = 30
MAX_COMPARES = 8
MAX_RUNS = 10
MAX_PEOPLE = 100
MAX_STAT_WEEKS = 26

PERF_HISTORY = os.environ.get("AUTODEPLOY_PERF_HISTORY", "/var/lib/amitista/perf/history.jsonl")
RELEASE_LEDGER = os.environ.get("AUTODEPLOY_RELEASE_LEDGER", "/var/www/amitista.com/releases.jsonl")
PERF_REPO = os.environ.get("AUTODEPLOY_PERF_REPO", "amitista-web")
MAX_PERF_RELEASES = 20
MAX_PERF_RUNS = 400
PERF_METRICS = ("lcp", "cls", "tbt", "fcp", "ttfb", "longTaskMs", "bytes")
PERF_FLOOR = {"lcp": 120, "fcp": 120, "ttfb": 120, "tbt": 50, "cls": 0.02, "longTaskMs": 150, "bytes": 20480}
PERF_FRACTION = 0.1
PULL_IN_SUBJECT = re.compile(r"\(#(\d+)\)\s*$")

QUEUE_DIR = os.environ.get("ADMIN_GITHUB_QUEUE", "/var/lib/amitista/admin/github-queue")
MAX_QUEUE_PER_TICK = 20
MAX_ACTION_LOG = 25

ROLES = ("pull", "triage", "push", "maintain", "admin")

LOGIN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")


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
    return done.stdout.rstrip("\n")


def commit_facts(path, ref):
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

    def __init__(self, auth, etags):
        self.auth = auth
        self.etags = dict(etags or {})
        self.remaining = None
        self.limit = None
        self.reset = None
        self.calls = 0
        self.spent = 0
        self.unreachable = False
        self.refused = []
        self.codes = {}
        self.messages = {}

    def get(self, path, have_cached=False, expected=()):
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


def ci_verdict(api, repo, sha, cached_entry):
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
    payload, state = api.get(
        "/repos/%s/%s/issues?state=open&sort=updated&direction=desc&per_page=%d"
        % (ORG, repo, MAX_ISSUES),
        isinstance(cached, list),
    )
    if state != "ok" or not isinstance(payload, list):
        return cached if isinstance(cached, list) else []

    out = []
    for entry in payload:
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


MAX_ALERTS = 20

SCAN_COMMITS = 50

ALERT_FEEDS = (
    ("dependabot", "dependabot/alerts", "dependencies with a known vulnerability"),
    ("secretScanning", "secret-scanning/alerts", "credentials committed to the repository"),
    ("codeScanning", "code-scanning/alerts", "findings from code analysis"),
)

ALERT_WHY = {
    404: "not available on this repository — GitHub offers it on paid plans, or it is switched off",
    403: "not available to this repository or this token",
    401: "the deploy's token was refused",
}

ALERT_REFUSALS = (401, 403, 404)

ALERT_RECHECK_SECONDS = int(os.environ.get("AUTODEPLOY_ALERT_RECHECK_SECONDS", "1800"))


def alert_row(feed, entry):
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
    held = cached if isinstance(cached, dict) else {}
    out = {}
    for feed, tail, what in ALERT_FEEDS:
        path = "/repos/%s/%s/%s?state=open&per_page=%d" % (ORG, repo, tail, MAX_ALERTS)
        was = held.get(feed) or {}

        asked = age_seconds(was.get("checked"))
        if was.get("available") is False and asked is not None and asked < ALERT_RECHECK_SECONDS:
            out[feed] = was
            continue

        payload, condition = api.get(
            path, isinstance(was.get("items"), list), expected=ALERT_REFUSALS
        )

        if condition == "unchanged" or (condition == "error" and api.code_for(path) is None):
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
    depth = git(path, "rev-list", "--count", "HEAD")
    if depth and depth.isdigit() and int(depth) > SCAN_COMMITS:
        return "HEAD~%d..HEAD" % SCAN_COMMITS
    root = git(path, "rev-list", "--max-parents=0", "HEAD")
    first = (root or "").splitlines()[0] if root else ""
    return "%s..HEAD" % first if first else None


def local_scan(path, head, was):
    scanner = os.path.join(path, "scripts", "scan-secrets.mjs")
    if not os.path.exists(scanner):
        return {"ran": False, "why": "this repository does not carry scripts/scan-secrets.mjs"}

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
        "findings": findings[:MAX_ALERTS],
    }


def scanner_rules(path, was):
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
    hook = os.path.join(path, ".githooks", "pre-push")
    scanner = os.path.join(path, "scripts", "scan-secrets.mjs")
    dist = os.path.join(path, "scripts", "check-dist-secrets.mjs")
    hooks_path = git(path, "config", "core.hooksPath")

    return {
        "prePush": {
            "shipped": os.path.exists(hook),
            "executable": os.path.exists(hook) and os.access(hook, os.X_OK),
            "hooksPath": hooks_path or None,
            "enabledHere": hooks_path == ".githooks",
        },
        "scanner": {
            "shipped": os.path.exists(scanner),
            "allowlisted": count_allowlist(path),
            "rules": scanner_rules(path, ((known or {}).get("guards") or {}).get("scanner", {}).get("rules")),
        },
        "build": {
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
    payload, state = api.get("/user", bool(cached))
    if state != "ok" or not isinstance(payload, dict):
        return cached
    return payload.get("login") or cached


def repo_access(api, repo, cached):
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
                "permission": entry.get("permissions"),
                "created": entry.get("created_at"),
                "expired": bool(entry.get("expired")),
                "by": inviter.get("login"),
                "url": entry.get("html_url"),
            }
        )
    return out


def org_people(api, cached):
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


def read_jsonl(path, limit):
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


PERF_CONFIRM_RUNS = 2


def run_samples(run):
    count = run.get("samples")
    return count if isinstance(count, int) and count > 0 else 1


def metric_moves(now, before, now_runs=None, before_runs=None):
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
                    "weight": round(change / (PERF_FLOOR.get(name) or 1), 2),
                    "runs": {"now": now_runs, "before": before_runs},
                    "confirmed": (
                        isinstance(now_runs, int)
                        and isinstance(before_runs, int)
                        and now_runs >= PERF_CONFIRM_RUNS
                        and before_runs >= PERF_CONFIRM_RUNS
                    ),
                }
            )
    out.sort(key=lambda move: (move["weight"] <= 0, -abs(move["weight"])))
    return out


def site_performance(repositories):
    runs = read_jsonl(PERF_HISTORY, MAX_PERF_RUNS)
    if not runs:
        return {
            "measured": None,
            "releases": [],
            "note": "no measurement has been taken on this box yet",
        }

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
            dateless += 1
            continue
        by_release.setdefault(name, []).append(run)

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
            "dirty": bool(recorded.get("dirty")),
            "runs": sum(run_samples(run) for run in group),
            "first": group[0].get("at"),
            "last": group[-1].get("at"),
            "pages": measured_pages(group),
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
            entry["pull"] = {"number": number}
        entries.append(entry)

    for index, entry in enumerate(entries):
        older = entries[index + 1] if index + 1 < len(entries) else None
        if older is None:
            continue
        entry["against"] = {
            "release": older["release"],
            "short": older.get("short"),
            "runs": older.get("runs"),
        }
        entry["moves"] = metric_moves(
            entry["pages"], older["pages"], entry.get("runs"), older.get("runs")
        )

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
                "guards": guards(path, head, known),
            }
        )
        if remote and remote != head:
            entry["tip"] = commit_facts(path, "origin/%s" % BRANCH)

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

    try:
        payload["performance"] = site_performance(repositories)
    except (OSError, ValueError, TypeError, KeyError) as failure:
        payload["performance"] = {
            "measured": None,
            "releases": [],
            "note": "could not read the performance history: %s" % failure,
        }
    payload["detail"] = now() if want_detail and not api.unreachable else previous.get("detail")
    if api.remaining is not None:
        payload["rate"] = {"remaining": api.remaining, "limit": api.limit, "reset": api.reset}
    if not auth:
        payload["note"] = "no GitHub token on this box — nothing could be asked of GitHub"
    elif api.unreachable:
        payload["note"] = "GitHub could not be reached in full; some of this may be from an earlier look"
    elif api.refused:
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
