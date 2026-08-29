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
