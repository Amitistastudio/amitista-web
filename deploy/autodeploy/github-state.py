#!/usr/bin/env python3

"""Record what each repository looks like right now, for the admin panel.

The panel cannot gather this itself. The GitHub token lives at /root/.gh-oauth,
readable only by root, and the admin API runs as amitista-admin under
ProtectHome=yes — it cannot see /root at all, which is the point. So the deploy,
which is already root and already holds the token, writes what it knows to a
file the panel is allowed to read. The token never leaves this process.

Called at the end of every deploy tick, so the snapshot is at most one tick old
— the same cadence as the deploy itself. Nothing here deploys or changes a
repository; it only looks.

    github-state.py OUT_PATH name=/path/to/checkout [name=/path ...]
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone

ORG = os.environ.get("AUTODEPLOY_ORG", "Amitistastudio")
TOKEN_FILE = os.environ.get("AUTODEPLOY_TOKEN_FILE", "/root/.gh-oauth")
GROUP = os.environ.get("ADMIN_GROUP", "amitista-admin")
BRANCH = "main"
TIMEOUT = 20

# A run GitHub has finished with will never change its mind, so its verdict is
# cached against the commit and never asked for twice. Anything else — queued,
# in progress, no run at all — is asked again next tick. That is what keeps this
# well inside the rate limit: three repositories idling cost nothing.
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


def ci_for(repo, sha, auth):
    """The workflow verdict for one exact commit.

    Returns (verdict, remaining). The verdict deliberately keeps GitHub's own
    two words — "completed/success", "queued/pending", "none" when no run has
    been recorded — because collapsing them to a boolean is what made the last
    stuck deploy unreadable. "unknown" means the question could not be asked,
    which is not the same as a commit having failed, and the panel says so.
    """
    if not auth or not sha:
        return "unknown", None

    url = "https://api.github.com/repos/%s/%s/actions/runs?head_sha=%s&per_page=1" % (ORG, repo, sha)
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": "token %s" % auth,
            "Accept": "application/vnd.github+json",
            "User-Agent": "amitista-autodeploy/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as answer:
            remaining = answer.headers.get("X-RateLimit-Remaining")
            payload = json.load(answer)
    except (urllib.error.URLError, OSError, ValueError):
        return "unknown", None

    try:
        remaining = int(remaining)
    except (TypeError, ValueError):
        remaining = None

    runs = payload.get("workflow_runs") or []
    if not runs:
        return "none", remaining
    run = runs[0]
    return "%s/%s" % (run.get("status") or "unknown", run.get("conclusion") or "pending"), remaining


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


def inspect(name, path, auth, previous):
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
        return entry, False

    remote = git(path, "rev-parse", "origin/%s" % BRANCH)
    dirty = git(path, "status", "--porcelain", "--untracked-files=no") or ""
    behind = git(path, "rev-list", "--count", "HEAD..origin/%s" % BRANCH) if remote else None
    ahead = git(path, "rev-list", "--count", "origin/%s..HEAD" % BRANCH) if remote else None

    known = cached(previous, name)
    asked = False
    if remote and known.get("remote") == remote and (known.get("ci") or "").split("/")[-1] in TERMINAL:
        verdict, remaining = known.get("ci"), None
    else:
        verdict, remaining = ci_for(name, remote, auth)
        asked = True

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
    if remaining is not None:
        entry["rateRemaining"] = remaining
    if asked:
        entry["checked"] = now()
    elif known.get("checked"):
        entry["checked"] = known["checked"]
    return entry, asked


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
    if len(sys.argv) < 3:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2

    out_path = sys.argv[1]
    pairs = []
    for argument in sys.argv[2:]:
        name, sep, path = argument.partition("=")
        if not sep or not name or not path:
            print("expected name=path, got %r" % argument, file=sys.stderr)
            return 2
        pairs.append((name, path))

    auth = token()
    previous = read_previous(out_path)

    repositories = []
    asked_any = False
    for name, path in pairs:
        entry, asked = inspect(name, path, auth, previous)
        repositories.append(entry)
        asked_any = asked_any or asked

    payload = {
        "generated": now(),
        "org": ORG,
        "branch": BRANCH,
        "repositories": repositories,
    }
    if not auth:
        payload["note"] = "no GitHub token on this box — CI verdicts are unavailable"

    try:
        write_atomic(out_path, payload)
    except OSError as failure:
        print("could not write %s: %s" % (out_path, failure), file=sys.stderr)
        return 1

    clean = sum(1 for entry in repositories if entry.get("synced") and not entry.get("dirty"))
    print(
        "github state: %d/%d in sync and clean%s"
        % (clean, len(repositories), "" if asked_any else " (CI verdicts cached)")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
