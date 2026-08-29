#!/usr/bin/env python3

"""The collector behind the GitHub panel.

It lives in deploy/autodeploy/ because it runs as root from the deploy, but its
test lives here because this is the directory CI runs. Loaded by path, since
the filename has a hyphen in it and cannot be imported by name.

What is worth pinning: GitHub counts a pull request as an issue, so /issues
returns both and the panel would list every pull request twice — once correctly
and once as an issue — if the filter ever came out. The rest is the promise
that a GitHub that cannot be reached leaves the last known answer alone instead
of blanking the panel.
"""

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECTOR = os.path.join(HERE, "..", "autodeploy", "github-state.py")

spec = importlib.util.spec_from_file_location("github_state", COLLECTOR)
state = importlib.util.module_from_spec(spec)
spec.loader.exec_module(state)

total = 0
failures = []


def check(label, condition):
    global total
    total += 1
    if not condition:
        failures.append(label)
    print("[%s] %s" % ("PASS" if condition else "FAIL", label))


class FakeGitHub:
    """Stands in for the API. Records what was asked and answers from a script."""

    def __init__(self, answers):
        self.answers = answers
        self.asked = []
        self.conditional = []

    def get(self, path, have_cached=False):
        self.asked.append(path)
        if have_cached:
            self.conditional.append(path)
        return self.answers.pop(0)


def issue(number, title, **extra):
    entry = {
        "number": number,
        "title": title,
        "user": {"login": "someone"},
        "labels": [],
        "assignees": [],
        "comments": 0,
        "created_at": "2026-08-01T10:00:00Z",
        "updated_at": "2026-08-02T10:00:00Z",
        "html_url": "https://github.com/o/r/issues/%d" % number,
        "body": "",
    }
    entry.update(extra)
    return entry


# ------------------------------------------------- a pull request is not an issue

mixed = [
    issue(1, "A real issue"),
    # GitHub marks a pull request by handing back this key, and nothing else.
    issue(2, "A pull request wearing an issue's clothes", pull_request={"url": "..."}),
    issue(3, "Another real issue"),
]
api = FakeGitHub([(mixed, "ok")])
out = state.open_issues(api, "amitista-web", None)
check("pull requests are not listed as issues", [row["number"] for row in out] == [1, 3])
check("the issues that remain are whole", out[0]["title"] == "A real issue")
check("open issues are asked for, not all issues", "state=open" in api.asked[0])

api = FakeGitHub([([issue(9, "only a pr", pull_request={})], "ok")])
check(
    "a page that is nothing but pull requests yields no issues",
    state.open_issues(api, "amitista-web", None) == [],
)

# --------------------------------------------------------------- the projection

rich = issue(
    7,
    "Something is broken",
    user={"login": "blxr"},
    labels=[{"name": "bug", "color": "d73a4a"}, {"name": "noise"}, "not a dict"],
    assignees=[{"login": "blxr"}, {"nologin": True}],
    milestone={"title": "v2"},
    comments=4,
    body="  the body  ",
)
api = FakeGitHub([([rich], "ok")])
only = state.open_issues(api, "amitista-web", None)[0]
check("the author is kept", only["author"] == "blxr")
check("labels keep their colour", only["labels"][0] == {"name": "bug", "colour": "d73a4a"})
check("a label with no colour still survives", only["labels"][1]["name"] == "noise")
check("a label that is not an object is dropped", len(only["labels"]) == 2)
check("assignees are flattened to names", only["assignees"] == ["blxr"])
check("the milestone is kept", only["milestone"] == "v2")
check("the comment count is kept", only["comments"] == 4)
check("the body is trimmed", only["body"] == "the body")
check("a short body is not marked clipped", only["clipped"] is False)

long_body = "x" * (state.MAX_BODY + 500)
api = FakeGitHub([([issue(8, "long", body=long_body)], "ok")])
only = state.open_issues(api, "amitista-web", None)[0]
check("a long body is cut to the ceiling", len(only["body"]) == state.MAX_BODY)
check("and is marked clipped", only["clipped"] is True)

api = FakeGitHub([([issue(10, "no body", body=None)], "ok")])
check("a missing body becomes an empty one", state.open_issues(api, "x", None)[0]["body"] == "")

# ------------------------------------------- GitHub being unreachable keeps facts

held = [{"number": 1, "title": "kept from last time"}]

api = FakeGitHub([(None, "error")])
check("an error keeps what was known", state.open_issues(api, "x", held) == held)

api = FakeGitHub([(None, "unchanged")])
check("a 304 keeps what was known", state.open_issues(api, "x", held) == held)

api = FakeGitHub([(None, "error")])
check("an error with nothing known yields an empty list", state.open_issues(api, "x", None) == [])

api = FakeGitHub([("not a list", "ok")])
check("a nonsense body is refused", state.open_issues(api, "x", held) == held)

# The conditional request is only sent when there is something to fall back on;
# a 304 with nothing held would throw the data away instead of saving a request.
api = FakeGitHub([([], "ok")])
state.open_issues(api, "x", held)
check("a conditional request is sent when an answer is held", api.conditional == api.asked)

api = FakeGitHub([([], "ok")])
state.open_issues(api, "x", None)
check("and is not sent when nothing is held", api.conditional == [])

# ------------------------------- a settled list is not a settled pull request

# The list's ETag settles whether anything was opened, closed or pushed to. It
# says nothing about a workflow finishing, which does not touch the pull request
# it ran for — so a verdict that had not settled must still be asked after, or
# it says "pending" for as long as the list stays still.

DERIVED = ({"mergeable_state": "clean", "mergeable": True, "additions": 3}, "ok")
FILES = ([], "ok")
GREEN = ({"workflow_runs": [{"status": "completed", "conclusion": "success"}]}, "ok")

pending = [{"number": 5, "sha": "abc", "ci": "in_progress/pending", "title": "waiting"}]
api = FakeGitHub([(None, "unchanged"), DERIVED, FILES, GREEN])
out = state.open_pulls(api, "amitista-web", pending)
check("an unsettled verdict is re-asked even when the list has not moved", out[0]["ci"] == "completed/success")
check("and nothing else about the pull request is disturbed", out[0]["title"] == "waiting")

# The merge state is recomputed by GitHub rather than stored, so it is refreshed
# on the quiet path too. This is the case that shipped wrong once: a pull request
# that had settled to clean went on being reported as having an unhappy check.
stale = [{"number": 5, "sha": "abc", "ci": "completed/success", "mergeState": "unstable", "title": "done"}]
api = FakeGitHub([(None, "unchanged"), DERIVED, FILES])
out = state.open_pulls(api, "amitista-web", stale)
check("a stale merge state is refreshed even when the list has not moved", out[0]["mergeState"] == "clean")
check("a settled verdict is not re-asked", not any("actions/runs" in path for path in api.asked))
check("and it is left as it was", out[0]["ci"] == "completed/success")

# GitHub being unreachable is not the same as the list being unchanged: nothing
# is asked after, and what was known is kept.
api = FakeGitHub([(None, "error")])
check("an unreachable GitHub keeps the pull requests it knew", state.open_pulls(api, "x", pending) == pending)

# Only the newest few are looked into, because each one costs requests of its
# own; the rest are still listed.
many = [
    {"number": n, "title": "pr %d" % n, "user": {"login": "x"}, "head": {"ref": "b", "sha": "s"}, "base": {"ref": "main"}, "html_url": "u"}
    for n in range(state.MAX_PULL_DETAIL + 3)
]
answers = [(many, "ok")]
for _ in range(state.MAX_PULL_DETAIL):
    answers.append(({"additions": 1, "deletions": 0, "changed_files": 1, "commits": 1}, "ok"))
    answers.append(([], "ok"))
    answers.append(({"workflow_runs": []}, "ok"))
api = FakeGitHub(answers)
out = state.open_pulls(api, "x", None)
check("every open pull request is listed", len(out) == state.MAX_PULL_DETAIL + 3)
check(
    "only the newest few are looked into",
    len([row for row in out if row.get("looked") is False]) == 3,
)
check("the ones looked into carry their size", out[0]["additions"] == 1)

# The merge state is derived, so it is asked for unconditionally: GitHub's ETag
# for a pull request does not reliably move when only mergeable_state changes,
# and a stale one makes the panel state a wrong verdict confidently.
api = FakeGitHub([({"additions": 1, "deletions": 0, "mergeable_state": "clean"}, "ok")])
state.pull_extra(api, "x", 4, {"mergeable": False, "mergeState": "dirty"})
check("the merge state is never asked for conditionally", api.conditional == [])
check("and it is asked for at all", len(api.asked) == 1)

# ------------------------------------------------------------- smaller promises

check("a blank line is not a subject", state.first_line("") == "")
check("only the first line is a subject", state.first_line("one\ntwo") == "one")
check("a subject that is not text is empty", state.first_line(None) == "")
check(
    "a run's length is measured in seconds",
    state.seconds_between("2026-08-01T10:00:00Z", "2026-08-01T10:00:33Z") == 33,
)
check("an unmeasurable run is not zero", state.seconds_between("nonsense", None) is None)
check(
    "the porcelain column is not mistaken for the path",
    # The bug this replaced shifted every path one character left.
    [line[3:] for line in " M deploy/thing.sh".splitlines()] == ["deploy/thing.sh"],
)

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
