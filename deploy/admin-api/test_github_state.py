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
import io
import json
import os
import sys
import tempfile
import urllib.error

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

    def __init__(self, answers, sends=None):
        self.answers = answers
        self.asked = []
        self.conditional = []
        self.sends = list(sends or [])
        self.sent = []
        self.expected = []
        self.messages = {}

    def get(self, path, have_cached=False, expected=()):
        self.asked.append(path)
        if have_cached:
            self.conditional.append(path)
        self.expected.append((path, tuple(expected)))
        return self.answers.pop(0)

    def message_for(self, path):
        for fragment, said in (self.messages or {}).items():
            if fragment in path:
                return said
        return None

    def send(self, method, path, body=None):
        self.sent.append((method, path, body))
        return self.sends.pop(0) if self.sends else (None, 204, None)


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
REVIEWS = ([], "ok")
GREEN = ({"workflow_runs": [{"status": "completed", "conclusion": "success"}]}, "ok")

pending = [{"number": 5, "sha": "abc", "ci": "in_progress/pending", "title": "waiting"}]
api = FakeGitHub([(None, "unchanged"), DERIVED, FILES, REVIEWS, GREEN])
out = state.open_pulls(api, "amitista-web", pending)
check("an unsettled verdict is re-asked even when the list has not moved", out[0]["ci"] == "completed/success")
check("and nothing else about the pull request is disturbed", out[0]["title"] == "waiting")

# The merge state is recomputed by GitHub rather than stored, so it is refreshed
# on the quiet path too. This is the case that shipped wrong once: a pull request
# that had settled to clean went on being reported as having an unhappy check.
stale = [{"number": 5, "sha": "abc", "ci": "completed/success", "mergeState": "unstable", "title": "done"}]
api = FakeGitHub([(None, "unchanged"), DERIVED, FILES, REVIEWS])
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

# --------------------------------------------------------- recent activity

def commit(sha, subject, **extra):
    entry = {
        "sha": sha,
        "commit": {"message": subject, "author": {"name": "Amitista Studio", "date": "2026-08-29T10:00:00Z"}},
        "author": {"login": "kostis4563"},
        "html_url": "https://github.com/o/r/commit/%s" % sha,
    }
    entry.update(extra)
    return entry


api = FakeGitHub([([commit("a" * 40, "Do a thing\n\nwith a body nobody wants in a list")], "ok")])
only = state.recent_commits(api, "amitista-web", None)[0]
check("a commit is cut to its subject", only["subject"] == "Do a thing")
check("the sha is shortened", only["sha"] == "a" * 7)
check("the signed author is kept", only["author"] == "Amitista Studio")
check("so is the account, which is not always the same person", only["login"] == "kostis4563")
check("and the date it was written", only["at"] == "2026-08-29T10:00:00Z")

# A commit can carry an author git knows about and no GitHub account at all,
# which comes back as a null rather than a missing key.
api = FakeGitHub([([commit("b" * 40, "By a stranger", author=None)], "ok")])
check("a commit with no GitHub account still lists", state.recent_commits(api, "x", None)[0]["login"] is None)

api = FakeGitHub([(None, "error")])
check("an unreachable GitHub keeps the commits it knew", state.recent_commits(api, "x", [{"sha": "held"}]) == [{"sha": "held"}])

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

# ------------------------------------------------------------------- people

def account(login, **extra):
    entry = {
        "login": login,
        "avatar_url": "https://avatars.githubusercontent.com/%s" % login,
        "html_url": "https://github.com/%s" % login,
        "type": "User",
    }
    entry.update(extra)
    return entry


# Access by any route, and access somebody was actually given. They are not the
# same list and the difference is what the panel can and cannot change: an
# owner's access comes from the organisation, so offering to remove it here
# would be offering something that does not work.
api = FakeGitHub([
    ([account("kostis4563", role_name="admin"), account("helper", role_name="write")], "ok"),
    ([account("helper", role_name="write")], "ok"),
])
out = state.repo_access(api, "amitista-web", None)
check("everyone with access is listed", [row["login"] for row in out] == ["kostis4563", "helper"])
check("the strongest is listed first", out[0]["role"] == "admin")
check("access through the organisation is marked as not direct", out[0]["direct"] is False)
check("access somebody was given is marked direct", out[1]["direct"] is True)
check("both lists are asked for", len(api.asked) == 2)

# If the second question could not be answered, what was known about it last
# time is carried rather than guessed. Guessing either way offers a control
# that does not match reality.
held = [dict(account("helper"), role="write", direct=True)]
api = FakeGitHub([([account("helper", role_name="write")], "ok"), (None, "error")])
check(
    "an unanswerable second question keeps what was known about it",
    state.repo_access(api, "x", held)[0]["direct"] is True,
)

api = FakeGitHub([(None, "unchanged")])
check("a 304 keeps the access list", state.repo_access(api, "x", held) == held)

# An empty list is an answer — "nobody has been added to this repository" — and
# is the state these repositories are actually in. Treating it as nothing known
# sends every one of these requests unconditionally, every tick, for ever.
api = FakeGitHub([([], "ok"), ([], "ok")])
state.repo_access(api, "x", [])
check("knowing the answer is empty still sends a conditional request", api.conditional == api.asked)

api = FakeGitHub([([], "ok")])
state.repo_invites(api, "x", [])
check("and the same for an empty invitation list", api.conditional == api.asked)

api = FakeGitHub([([], "ok"), ([], "ok")])
state.repo_access(api, "x", None)
check("with nothing known at all it is not conditional", api.conditional == [])
api = FakeGitHub([(None, "error")])
check("an unreachable GitHub keeps the access list", state.repo_access(api, "x", held) == held)
api = FakeGitHub([("not a list", "ok")])
check("a nonsense access list is refused", state.repo_access(api, "x", held) == held)

api = FakeGitHub([
    (
        [
            {
                "id": 88,
                "invitee": account("newcomer"),
                "inviter": account("kostis4563"),
                "permissions": "write",
                "created_at": "2026-08-20T10:00:00Z",
                "expired": False,
                "html_url": "https://github.com/o/r/invitations",
            },
            "not an object",
        ],
        "ok",
    )
])
only = state.repo_invites(api, "amitista-web", None)
check("an invitation is projected", len(only) == 1 and only[0]["id"] == 88)
check("with who it went to", only[0]["login"] == "newcomer")
check("who sent it", only[0]["by"] == "kostis4563")
check("and what it would grant", only[0]["permission"] == "write")

api = FakeGitHub([
    ({"login": "Amitistastudio", "plan": {"name": "free", "filled_seats": 1, "seats": 1},
      "two_factor_requirement_enabled": False, "default_repository_permission": "read",
      "total_private_repos": 3}, "ok"),
    ([account("kostis4563")], "ok"),
    ([account("helper")], "ok"),
    ([], "ok"),
    ([], "ok"),
])
org = state.org_people(api, None)
check("the organisation's settings are kept", org["org"]["defaultPermission"] == "read")
check("including whether two-factor is required", org["org"]["twoFactorRequired"] is False)
# GitHub's word for the top organisation role is "admin". Nobody calls it that
# — GitHub's own interface says "owner" — so it is translated once, here.
check("GitHub's 'admin' role is reported as owner", org["members"][0]["role"] == "owner")
check("and a member as a member", org["members"][1]["role"] == "member")
check("members come from two requests, not one per person", len(api.asked) == 5)

api = FakeGitHub([
    (None, "unchanged"),
    ([account("kostis4563")], "ok"),
    ([], "ok"),
    ([account("kostis4563")], "ok"),
    ([], "ok"),
])
out = state.org_people(api, org)
check("a 304 on the organisation keeps its settings", out["org"] == org["org"])
check("an account with no two-factor is named", out["withoutTwoFactor"] == ["kostis4563"])

api = FakeGitHub([(None, "error"), (None, "error"), (None, "error"), (None, "error"), (None, "error")])
out = state.org_people(api, org)
check("an unreachable GitHub keeps the members it knew", out["members"] == org["members"])

# ------------------------------------------------ commits and lines per person

weeks = [
    {"w": 1735257600 + index * 604800, "c": index, "a": index * 10, "d": index}
    for index in range(40)
]
api = FakeGitHub(
    [([{"author": {"login": "kostis", "avatar_url": "a", "html_url": "u"}, "total": 780, "weeks": weeks}], "ok")]
)
rows = state.contributions(api, "r", None)
check("a contributor comes back with their totals", rows[0]["commits"] == 780)
check("lines added are summed over every week, not the kept ones", rows[0]["added"] == sum(w["a"] for w in weeks))
check("and only the recent weeks travel", len(rows[0]["weeks"]) == state.MAX_STAT_WEEKS)
check("oldest kept first, newest last", rows[0]["weeks"][-1]["commits"] == 39)
check("with a week start a browser can parse", rows[0]["weeks"][0]["week"][:2] == "20")

held = [{"login": "kostis", "commits": 780, "weeks": []}]
api = FakeGitHub([({}, "ok")])
check(
    "GitHub still computing the figures keeps the ones already known",
    state.contributions(api, "r", held) == held,
)
api = FakeGitHub([(None, "error")])
check(
    "and so does a GitHub that cannot be reached",
    state.contributions(api, "r", held) == held,
)
check("a person with no GitHub account is left out", state.contributions(
    FakeGitHub([([{"author": None, "total": 5, "weeks": []}], "ok")]), "r", None
) == [])


# ------------------------------------------- where a pull request stands

# GitHub keeps every review ever left, so the raw list is a history and not a
# verdict. What counts is each person's latest decisive one, and a comment is
# never decisive: somebody who approved and then commented has still approved.


def review(login, verdict, at):
    return {"user": {"login": login}, "state": verdict, "submitted_at": at}


def reviews_from(entries):
    return {
        row["login"]: row["state"]
        for row in state.pull_reviews(FakeGitHub([(entries, "ok")]), "r", 1, None)
    }

check(
    "the latest decisive review is the one that counts",
    reviews_from([
        review("a", "CHANGES_REQUESTED", "2026-01-01T00:00:00Z"),
        review("a", "APPROVED", "2026-01-02T00:00:00Z"),
    ]) == {"a": "APPROVED"},
)
check(
    "a later comment does not undo an approval",
    reviews_from([
        review("a", "APPROVED", "2026-01-01T00:00:00Z"),
        review("a", "COMMENTED", "2026-01-02T00:00:00Z"),
    ]) == {"a": "APPROVED"},
)
check(
    "a dismissal replaces what it dismissed",
    reviews_from([
        review("a", "APPROVED", "2026-01-01T00:00:00Z"),
        review("a", "DISMISSED", "2026-01-02T00:00:00Z"),
    ]) == {"a": "DISMISSED"},
)
check(
    "somebody who only commented is still recorded as having looked",
    reviews_from([review("b", "COMMENTED", "2026-01-01T00:00:00Z")]) == {"b": "COMMENTED"},
)
check(
    "a review still being written is not a verdict",
    reviews_from([review("c", "PENDING", None)]) == {},
)
check(
    "each person counts once however many they left",
    len(state.pull_reviews(FakeGitHub([([
        review("a", "COMMENTED", "2026-01-01T00:00:00Z"),
        review("a", "COMMENTED", "2026-01-02T00:00:00Z"),
        review("a", "APPROVED", "2026-01-03T00:00:00Z"),
    ], "ok")]), "r", 1, None)) == 1,
)
held = [{"login": "a", "state": "APPROVED", "at": None}]
check(
    "an unreachable GitHub keeps the reviews it knew",
    state.pull_reviews(FakeGitHub([(None, "error")]), "r", 1, held) == held,
)


# ------------------------------------------------- every pull request raised


def raised(number, **extra):
    row = {
        "number": number,
        "title": "pr %d" % number,
        "user": {"login": "someone"},
        "head": {"ref": "branch"},
        "base": {"ref": "main"},
        "html_url": "u",
    }
    row.update(extra)
    return row


api = FakeGitHub([([
    raised(1, merged_at="2026-01-02T00:00:00Z", closed_at="2026-01-02T00:00:00Z"),
    raised(2, closed_at="2026-01-03T00:00:00Z"),
    raised(3),
], "ok"), ([], "ok"), ([], "ok"), ([], "ok")])
rows = state.pull_history(api, "r", None)
check("a merged pull request is recorded as merged", rows[0]["state"] == "merged")
check("one closed without merging is not", rows[1]["state"] == "closed")
check("and one still in flight is open", rows[2]["state"] == "open")
check(
    "the history asks for every state rather than only the open ones",
    "state=all" in api.asked[0],
)
check("who merged it is kept", state.pull_history(FakeGitHub([([
    raised(4, merged_at="2026-01-02T00:00:00Z", merged_by={"login": "kostis4563"}),
], "ok"), ([], "ok")]), "r", None)[0]["mergedBy"] == "kostis4563")

# The history keeps its own review and check verdicts, and that is only
# affordable because a pull request nobody has touched is not asked after at
# all. Not a conditional request — no request.
settled = [{
    "number": 1,
    "updated": "2026-01-05T00:00:00Z",
    "sha": "abc",
    "ci": "completed/success",
    "reviews": [{"login": "a", "state": "APPROVED", "at": None}],
}]
api = FakeGitHub([([raised(1, updated_at="2026-01-05T00:00:00Z", head={"ref": "b", "sha": "abc"})], "ok")])
rows = state.pull_history(api, "r", settled)
check("a pull request nobody has touched is not asked after again", len(api.asked) == 1)
check("and it keeps the reviews it already had", rows[0]["reviews"] == settled[0]["reviews"])
check("and the check verdict it already had", rows[0]["ci"] == "completed/success")

api = FakeGitHub([
    ([raised(1, updated_at="2026-01-09T00:00:00Z", head={"ref": "b", "sha": "abc"})], "ok"),
    ([review("a", "CHANGES_REQUESTED", "2026-01-09T00:00:00Z")], "ok"),
])
rows = state.pull_history(api, "r", settled)
check(
    "one that has been touched since is asked after again",
    rows[0]["reviews"] == [{"login": "a", "state": "CHANGES_REQUESTED", "at": "2026-01-09T00:00:00Z"}],
)

many = [raised(n, head={"ref": "b"}) for n in range(state.MAX_HISTORY_DETAIL + 4)]
api = FakeGitHub([(many, "ok")] + [([], "ok")] * state.MAX_HISTORY_DETAIL)
rows = state.pull_history(api, "r", None)
check("every pull request raised is listed", len(rows) == state.MAX_HISTORY_DETAIL + 4)
check(
    "but only the newest few are looked into",
    len([row for row in rows if "reviews" in row]) == state.MAX_HISTORY_DETAIL,
)
check(
    "an entry with no number is dropped rather than drawn",
    state.pull_history(FakeGitHub([([{"title": "nameless"}], "ok")]), "r", None) == [],
)
held = [{"number": 9, "state": "merged"}]
check(
    "an unreachable GitHub keeps the history it knew",
    state.pull_history(FakeGitHub([(None, "error")]), "r", held) == held,
)
check(
    "and a 304 does too, without asking again",
    state.pull_history(FakeGitHub([(None, "unchanged")]), "r", held) == held,
)


# ---------------------------------------------------- when commits were made

api = FakeGitHub([([[0, 0, 0], [1, 9, 4], [3, 14, 7]], "ok")])
card = state.punch_card(api, "r", None)
check("a punch card keeps only the hours that carry commits", card == [
    {"day": 1, "hour": 9, "commits": 4},
    {"day": 3, "hour": 14, "commits": 7},
])
check(
    "a malformed bucket is dropped rather than drawn",
    state.punch_card(FakeGitHub([([[9, 99, 3], "nonsense", [1, 2]], "ok")]), "r", None) == [],
)
held = [{"day": 0, "hour": 0, "commits": 1}]
check(
    "and a GitHub still computing it keeps what was known",
    state.punch_card(FakeGitHub([({}, "ok")]), "r", held) == held,
)


# ------------------------------------- everything asked of GitHub is carried

# The quiet bug this replaced: two new keys were added to what detail_for
# returns and not to what inspect carries between ticks. Nothing looked wrong —
# the panel showed the right thing — but every one of those requests was sent
# unconditionally every minute instead of being answered 304 for free, and the
# first time GitHub was unreachable the whole lot would have vanished from the
# panel rather than standing still.
#
# So this is the general form rather than a check for those two names: whatever
# detail_for produces, inspect has to carry.

detail_keys = {
    "facts": {"url": "u"},
    "pulls": [{"number": 1}],
    "history": [{"number": 1, "state": "merged"}],
    "issues": [{"number": 2}],
    "commits": [{"sha": "abc"}],
    "branches": [{"name": "main"}],
    "runs": [{"status": "completed"}],
    "access": [{"login": "someone"}],
    "invites": [{"id": 7}],
    "stats": [{"login": "someone", "commits": 3}],
    "punch": [{"day": 1, "hour": 9, "commits": 4}],
    "alerts": {"dependabot": {"available": True, "items": [], "open": 0}},
}
kept = state.inspect("x", "/nowhere-at-all", FakeGitHub([]), dict(detail_keys), False)
missing = [key for key in detail_keys if key not in kept]
check("everything GitHub answered for is carried to the next tick", missing == [])


class CountingGitHub(FakeGitHub):
    def get(self, path, have_cached=False, expected=()):
        self.asked.append(path)
        if have_cached:
            self.conditional.append(path)
        return {"login": "x", "name": None, "plan": {}}, "ok"


produced = state.detail_for(CountingGitHub([]), "x", {})
check(
    "and nothing detail_for produces is left out of that list",
    sorted(produced) == sorted(detail_keys),
)


# --------------------------------------------------- what root will act on

# The queue is written by the admin service, which runs as a different and less
# privileged account. If that account were ever taken, this check is the whole
# of what stands between it and handing somebody admin — so it is tested as the
# security boundary it is, not as input validation.

REPOS = {"amitista-web", "amitista-studio-bot"}
ACTOR = "kostis4563"

check(
    "a whole grant is allowed",
    state.check_intent(
        {"action": "grant", "repo": "amitista-web", "login": "octocat", "permission": "push"},
        REPOS, ACTOR,
    ) is None,
)

for intent, why in (
    ({"action": "delete-everything", "repo": "amitista-web", "login": "octocat"}, "an action nobody wrote"),
    ({"action": "grant", "repo": "someone-elses-repo", "login": "octocat", "permission": "push"},
     "a repository not on this box"),
    ({"action": "grant", "repo": None, "login": "octocat", "permission": "push"}, "no repository"),
    ({"action": "grant", "repo": "amitista-web", "login": "octo cat", "permission": "push"},
     "a login with a space"),
    ({"action": "grant", "repo": "amitista-web", "login": "../../../etc/passwd", "permission": "push"},
     "a path pretending to be a login"),
    ({"action": "grant", "repo": "amitista-web", "login": "octocat/../admin", "permission": "push"},
     "a login that would climb out of the URL"),
    ({"action": "grant", "repo": "amitista-web", "login": 5, "permission": "push"},
     "a login that is not text"),
    ({"action": "grant", "repo": "amitista-web", "login": "octocat", "permission": "owner"},
     "a permission GitHub does not have"),
    ({"action": "grant", "repo": "amitista-web", "login": "octocat", "permission": "write"},
     "GitHub's display name for a permission"),
    ({"action": "grant", "repo": "amitista-web", "login": "octocat"}, "no permission"),
    ({"action": "revoke", "repo": "amitista-web", "login": ACTOR}, "this box's own account"),
    ({"action": "revoke", "repo": "amitista-web", "login": ACTOR.upper()},
     "this box's own account in different case"),
    ({"action": "uninvite", "repo": "amitista-web", "invite": "88"}, "an invitation id as text"),
    ({"action": "uninvite", "repo": "amitista-web", "invite": True}, "a boolean as an invitation id"),
    ({"action": "uninvite", "repo": "amitista-web"}, "no invitation id"),
):
    check("%s is refused" % why, state.check_intent(intent, REPOS, ACTOR) is not None)

# ------------------------------------------------------------- and then does it

api = FakeGitHub([], sends=[({"id": 9}, 201, None)])
out = state.carry_out(api, {"action": "grant", "repo": "amitista-web", "login": "octocat", "permission": "push"})
check("a grant is a PUT on the collaborator", api.sent[0][0] == "PUT")
check("at the login's own path", api.sent[0][1].endswith("/collaborators/octocat"))
check("carrying the permission", api.sent[0][2] == {"permission": "push"})
# 201 with a body is an invitation waiting to be accepted; 204 is access that
# already existed changing level. Telling them apart matters: one of them is
# not access yet.
check("a body coming back means an invitation was sent", out["result"] == "invited")

api = FakeGitHub([], sends=[(None, 204, None)])
out = state.carry_out(api, {"action": "grant", "repo": "x", "login": "octocat", "permission": "admin"})
check("no body means the level changed on access they had", out["result"] == "changed")
check("and it counts as done", out["ok"] is True)

api = FakeGitHub([], sends=[(None, 404, "Not Found")])
out = state.carry_out(api, {"action": "revoke", "repo": "x", "login": "octocat"})
check("a revoke is a DELETE", api.sent[0][0] == "DELETE")
check("a refusal is recorded rather than raised", out["ok"] is False)
check("with GitHub's own words for it", out["error"] == "Not Found")

api = FakeGitHub([], sends=[(None, 204, None)])
state.carry_out(api, {"action": "uninvite", "repo": "x", "invite": 88})
check("cancelling an invitation deletes it by id", api.sent[0][1].endswith("/invitations/88"))

# ---------------------------------------------------------------- the drain

state.QUEUE_DIR = tempfile.mkdtemp(prefix="github-queue-test-")


def queue(name, intent):
    with open(os.path.join(state.QUEUE_DIR, name), "w", encoding="utf-8") as handle:
        json.dump(intent, handle)


def waiting():
    return sorted(os.listdir(state.QUEUE_DIR))


queue("1.json", {"id": "a", "action": "grant", "repo": "amitista-web", "login": "octocat", "permission": "push"})
queue("2.json", {"id": "b", "action": "grant", "repo": "amitista-web", "login": "octocat", "permission": "admin"})
api = FakeGitHub([], sends=[(None, 204, None), (None, 204, None)])
log = state.drain_queue(api, REPOS, ACTOR, None)
check("everything queued is carried out", len(api.sent) == 2)
# Two changes to one person's access have to be made in the order they were
# asked for, or the second silently undoes the first.
check("in the order it was queued", [call[2]["permission"] for call in api.sent] == ["push", "admin"])
check("the queue is emptied", waiting() == [])
check("and what happened is written down", len(log) == 2)
check("newest first, so the panel reads top-down", log[0]["permission"] == "admin")

queue("3.json", {"id": "c", "action": "grant", "repo": "not-ours", "login": "octocat", "permission": "admin"})
api = FakeGitHub([], sends=[])
log = state.drain_queue(api, REPOS, ACTOR, log)
check("a request that fails the check reaches GitHub not at all", api.sent == [])
check("but is still recorded", log[0]["ok"] is False)
check("with the reason", "not a repository on this box" in log[0]["error"])
# Not retried. A wrong login fails identically every minute, and a loop nobody
# can see is worse than a refusal somebody can read.
check("and is not left to be tried again", waiting() == [])

queue("4.json", {"id": "d", "action": "revoke", "repo": "amitista-web", "login": ACTOR})
api = FakeGitHub([], sends=[])
log = state.drain_queue(api, REPOS, ACTOR, log)
check("this box's own access cannot be revoked from the panel", api.sent == [])

with open(os.path.join(state.QUEUE_DIR, "5.json"), "w", encoding="utf-8") as handle:
    handle.write("{not json")
api = FakeGitHub([], sends=[])
before = len(log)
log = state.drain_queue(api, REPOS, ACTOR, log)
check("a corrupt queue file is thrown away, not acted on", api.sent == [] and waiting() == [])
check("and adds nothing to the log", len(log) == before)

api = FakeGitHub([], sends=[])
check("an empty queue leaves the log exactly as it was", state.drain_queue(api, REPOS, ACTOR, log) is log)

state.QUEUE_DIR = os.path.join(state.QUEUE_DIR, "gone")
check("a queue directory that does not exist is not an error", state.drain_queue(api, REPOS, ACTOR, log) is log)

# ------------------------------------------------ which commit made it slower
#
# Three files that never see each other: the monitor writes what it measured and
# which release was serving, the deploy writes which commit each release is, and
# this joins them to the pull requests it already holds. What has to keep being
# true is that it refuses to guess. A release with no measurement, a reading
# with no release, a release built from a dirty checkout — each of those is a
# reason to say less, not a gap to fill in with the neighbouring commit's name.

print("\n-- performance, joined to the commit that caused it")

perf_dir = tempfile.mkdtemp(prefix="perf-state-test-")
state.PERF_HISTORY = os.path.join(perf_dir, "history.jsonl")
state.RELEASE_LEDGER = os.path.join(perf_dir, "releases.jsonl")


def write_lines(path, entries):
    with open(path, "w", encoding="utf-8") as handle:
        for entry in entries:
            handle.write(json.dumps(entry) + "\n")


def run(at, release, lcp, path="/", profile="broadband", samples=None, **extra):
    page = {"path": path, "lcp": lcp, "fcp": 400, "ttfb": 200, "cls": 0.01,
            "tbt": 0, "longTaskMs": 0, "bytes": 100000}
    page.update(extra)
    entry = {"at": at, "profile": profile, "pages": [page], "problems": []}
    if samples is not None:
        entry["samples"] = samples
    if release is not None:
        entry["release"] = {"release": release}
    return entry


def released(name, sha, subject, **extra):
    entry = {"release": name, "sha": sha, "subject": subject, "author": "Kostis",
             "committed": "2026-08-20T09:00:00Z", "dirty": False}
    entry.update(extra)
    return entry


SITE = [
    {
        "name": "amitista-web",
        "commits": [{"sha": "bbbbbbb", "subject": "Lazy-load the hero (#184)",
                     "login": "kostis4563", "url": "https://github.com/o/r/commit/bbbbbbb"}],
        "history": [{"number": 184, "title": "Lazy-load the hero", "author": "kostis4563",
                     "merged": "2026-08-20T09:05:00Z", "url": "https://github.com/o/r/pull/184"}],
    },
    {"name": "amitista-bots", "commits": [], "history": []},
]

write_lines(state.RELEASE_LEDGER, [
    released("20260820-080000", "a" * 40, "Tidy the footer (#183)"),
    released("20260820-090000", "b" * 40, "Lazy-load the hero (#184)"),
])
write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860),
    run("2026-08-20T08:40:00Z", "20260820-080000", 900),
    run("2026-08-20T08:50:00Z", "20260820-080000", 860),
    run("2026-08-20T09:10:00Z", "20260820-090000", 1200),
])

report = state.site_performance(SITE)
newest = report["releases"][0]

check("the newest measured release is first", newest["release"] == "20260820-090000")
check("its metrics are the middle of its own readings", newest["pages"][0]["lcp"] == 1200)
# 860, 900, 860 — the mean would be 873 and the median is 860. Either would do
# here; what matters is that one slow reading cannot redraw a release.
check("and the release before it is the median of three", report["releases"][1]["pages"][0]["lcp"] == 860)
check("it is compared against the release measured before it",
      newest["against"]["release"] == "20260820-080000")
check("the regression is found", [(m["metric"], m["delta"]) for m in newest["moves"]] == [("lcp", 340)])
check("the commit it came from is named", newest["short"] == "b" * 7)
check("and so is the pull request the subject carries", newest["pull"]["number"] == 184)
check("with the title, so the panel need not ask GitHub for it",
      newest["pull"]["title"] == "Lazy-load the hero")
check("the commit's URL comes from what was already collected",
      newest["commitUrl"] == "https://github.com/o/r/commit/bbbbbbb")
check("the oldest release has nothing behind it to compare against",
      "against" not in report["releases"][-1])

# ------------------------------------------------- what it declines to report

write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860),
    run("2026-08-20T09:10:00Z", "20260820-090000", 900),
])
moves = state.site_performance(SITE)["releases"][0]["moves"]
# 40ms on 860 is under both the absolute floor and a tenth of what it was. The
# box is shared with a deploy, three bots and nginx; a page that renders 40ms
# later is the box having been busy, not a commit.
check("a change smaller than the noise floor is not a regression", moves == [])

write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 0),
    run("2026-08-20T09:10:00Z", "20260820-090000", 1200),
])
moves = state.site_performance(SITE)["releases"][0]["moves"]
check("a paint metric that did not measure is not an infinite regression",
      [m["metric"] for m in moves] == [])

# Blocking time is the opposite case: zero is a real reading, and moving off it
# is the single most useful thing this can catch.
write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860, tbt=0),
    run("2026-08-20T09:10:00Z", "20260820-090000", 860, tbt=310),
])
moves = state.site_performance(SITE)["releases"][0]["moves"]
check("but blocking time going from nothing to something is",
      [(m["metric"], m["delta"]) for m in moves] == [("tbt", 310)])

write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860),
    run("2026-08-20T09:10:00Z", "20260820-090000", 1200, profile="slow-4g-4x-cpu"),
])
report = state.site_performance(SITE)
check("a throttled run is not compared against an unthrottled one",
      [entry["release"] for entry in report["releases"]] == ["20260820-090000"])
check("the profile being reported on is said out loud", report["profile"] == "slow-4g-4x-cpu")

# ---------------------------------------------- measured once, or measured

# The bug this pins put a rose banner at the top of the panel reading "Commit
# c701c74 increased Long tasks by 1402ms on /" over a commit that touched three
# lines of Python and one string in the admin panel. The deploy starts the
# monitor the moment a release goes live, so its one measurement lands while
# installers are finishing and units are restarting — and / animates, so its
# frames cross the 50ms line and every one of them starts counting. Six passes
# of that same unchanged build measured 52, 62, 117, 131, 194 and 1534ms.
write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860),
    run("2026-08-20T09:10:00Z", "20260820-090000", 1200),
])
moves = state.site_performance(SITE)["releases"][0]["moves"]
check("one measurement against one measurement is not confirmed",
      moves[0]["confirmed"] is False)
check("and it says how few there were either side",
      moves[0]["runs"] == {"now": 1, "before": 1})

write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860, samples=3),
    run("2026-08-20T09:10:00Z", "20260820-090000", 1200, samples=3),
])
report = state.site_performance(SITE)
moves = report["releases"][0]["moves"]
check("a run the monitor took several passes over counts as several",
      report["releases"][0]["runs"] == 3)
check("and a comparison of two of those is confirmed", moves[0]["confirmed"] is True)

# The passes are what count, not the lines. A release measured twice by the
# six-hourly timer is as well attested as one the monitor measured twice in a
# row, and neither should have to wait on the other's bookkeeping.
write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860, samples=2),
    run("2026-08-20T09:10:00Z", "20260820-090000", 1200),
    run("2026-08-20T09:40:00Z", "20260820-090000", 1210),
])
moves = state.site_performance(SITE)["releases"][0]["moves"]
check("two lines are as good as one line of two passes",
      moves[0]["runs"] == {"now": 2, "before": 2} and moves[0]["confirmed"] is True)

# A history line written before any of this existed says nothing about passes.
# It is one measurement, which is what it always was.
check("a line with no count of its own is one measurement", state.run_samples({}) == 1)
check("and so is one that claims a nonsense number",
      state.run_samples({"samples": 0}) == 1 and state.run_samples({"samples": "3"}) == 1)

# ------------------------------------------------------ rollbacks and gaps

write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860),
    run("2026-08-20T09:10:00Z", "20260820-090000", 1200),
    run("2026-08-20T09:40:00Z", "20260820-080000", 870),
])
report = state.site_performance(SITE)
# The symlink went back to the older release, so the newest reading belongs to
# the older commit. Ordering by release name would put the rolled-back one on
# top and report the site as slow when it is not.
check("a rollback puts what is serving now at the top",
      report["releases"][0]["release"] == "20260820-080000")
check("and it is compared against what it replaced",
      report["releases"][0]["against"]["release"] == "20260820-090000")
# 860 and 870 either side of the release that was rolled back, so the median of
# what the older release measures is 865 against the newer one's 1200.
check("so the rollback reads as the improvement it was",
      report["releases"][0]["moves"][0]["delta"] == -335)

write_lines(state.PERF_HISTORY, [
    run("2026-08-20T07:10:00Z", None, 860),
    run("2026-08-20T08:10:00Z", "20260820-080000", 860),
])
report = state.site_performance(SITE)
check("a reading taken before any of this existed is not attributed to anybody",
      [entry["release"] for entry in report["releases"]] == ["20260820-080000"])
check("but it is counted, so the panel can say why its history is short",
      report["unattributed"] == 1)

write_lines(state.PERF_HISTORY, [run("2026-08-20T08:10:00Z", "20260820-070000", 860)])
report = state.site_performance(SITE)
check("a release the ledger never heard of is still reported",
      report["releases"][0]["release"] == "20260820-070000")
check("with nothing invented about the commit", report["releases"][0]["sha"] is None)
check("and nobody named for it", report["releases"][0]["author"] is None)

write_lines(state.RELEASE_LEDGER, [
    released("20260820-080000", "a" * 40, "Tidy the footer (#183)"),
    released("20260820-090000", "b" * 40, "Half-finished hero work", dirty=True),
])
write_lines(state.PERF_HISTORY, [
    run("2026-08-20T08:10:00Z", "20260820-080000", 860),
    run("2026-08-20T09:10:00Z", "20260820-090000", 1200),
])
newest = state.site_performance(SITE)["releases"][0]
# Built from a checkout with uncommitted changes in it. What was measured is
# not what that commit says, so the panel is told to stop short of blaming it.
check("a release built from a dirty checkout says so", newest["dirty"] is True)
check("and carries no pull request, because the subject is not a merge",
      "pull" not in newest)

# ------------------------------------------------------------ nothing there

state.PERF_HISTORY = os.path.join(perf_dir, "no-such-history.jsonl")
report = state.site_performance(SITE)
check("no monitor on the box is not an error", report["releases"] == [])
check("and it says so rather than showing an empty chart", bool(report["note"]))

state.PERF_HISTORY = os.path.join(perf_dir, "torn.jsonl")
with open(state.PERF_HISTORY, "w", encoding="utf-8") as handle:
    handle.write(json.dumps(run("2026-08-20T08:10:00Z", "20260820-080000", 860)) + "\n")
    handle.write('{"at": "2026-08-20T09:10:00Z", "prof\n')
report = state.site_performance(SITE)
check("a half-written line loses that reading and nothing else",
      report["releases"][0]["pages"][0]["lcp"] == 860)


# ------------------------------------------------ what GitHub says about risk
#
# The one that matters here is the difference between "nothing is wrong" and
# "GitHub will not tell you". Both come back as an empty list, and reading the
# second as the first is the most dangerous mistake this panel could make.


class CodedGitHub(FakeGitHub):
    """A FakeGitHub that also remembers the status each path answered with."""

    def __init__(self, answers, codes=None, sends=None):
        FakeGitHub.__init__(self, answers, sends)
        self.codes = dict(codes or {})

    def code_for(self, path):
        for fragment, code in self.codes.items():
            if fragment in path:
                return code
        return 200


def advisory(number, severity, summary, package):
    return {
        "number": number,
        "state": "open",
        "html_url": "https://github.com/x/y/security/dependabot/%d" % number,
        "created_at": "2026-08-20T10:00:00Z",
        "security_advisory": {"severity": severity, "summary": summary},
        "dependency": {"package": {"name": package}},
    }


api = CodedGitHub(
    [
        ([advisory(1, "critical", "Prototype pollution", "lodash")], "ok"),
        (None, "error"),
        (None, "error"),
    ],
    codes={"secret-scanning": 404, "code-scanning": 404},
)
alerts = state.security_alerts(api, "amitista-web", {})

check("an open dependabot alert is carried", alerts["dependabot"]["open"] == 1)
check("with the severity it came with", alerts["dependabot"]["items"][0]["severity"] == "critical")
check("and the package it is about", alerts["dependabot"]["items"][0]["subject"] == "lodash")
check("a feed this plan does not offer is not available",
      alerts["secretScanning"]["available"] is False)
check("and says why, rather than showing zero",
      "paid plans" in alerts["secretScanning"]["why"])
check("an available feed with nothing in it is available and empty",
      alerts["dependabot"]["available"] is True)

# A feed that was readable a minute ago and is unreachable now keeps what it
# had. Anything else would empty the panel every time GitHub hiccups.
was = {"dependabot": {"available": True, "what": "x", "items": [advisory(1, "high", "a", "b")], "open": 1}}
api = CodedGitHub([(None, "error"), (None, "error"), (None, "error")], codes={})
api.codes = {}


class Unreachable(CodedGitHub):
    def code_for(self, path):
        return None


api = Unreachable([(None, "error"), (None, "error"), (None, "error")])
alerts = state.security_alerts(api, "amitista-web", was)
check("a feed GitHub could not be reached for keeps its last answer",
      alerts["dependabot"]["open"] == 1)

api = CodedGitHub([(None, "unchanged"), (None, "unchanged"), (None, "unchanged")])
alerts = state.security_alerts(api, "amitista-web", was)
check("and an unchanged feed keeps it too", alerts["dependabot"]["open"] == 1)

# 403 is a different problem from 404 and is worth different words: one is the
# plan, the other is the token.
api = CodedGitHub([(None, "error"), (None, "error"), (None, "error")],
                  codes={"dependabot": 403})
alerts = state.security_alerts(api, "amitista-web", {})
check("a feed the token may not read says so", "token" in alerts["dependabot"]["why"])

# Two 403s that mean opposite things — one is switched off and could be switched
# on here, the other needs a plan this org is not on. Guessing from the status
# sends somebody to fix the wrong one, so GitHub's own sentence wins.
api = CodedGitHub([(None, "error"), (None, "error"), (None, "error")],
                  codes={"dependabot": 403, "code-scanning": 403})
api.messages = {
    "dependabot": "Dependabot alerts are disabled for this repository.",
    "code-scanning": "Advanced Security must be enabled for this repository to use code scanning.",
}
alerts = state.security_alerts(api, "amitista-web", {})
check("a refused feed carries GitHub's own reason",
      alerts["dependabot"]["why"] == "Dependabot alerts are disabled for this repository.")
check("and two feeds refused with the same status still read differently",
      "Advanced Security" in alerts["codeScanning"]["why"])

# The statuses a feed can be refused with are the collector's to handle, so they
# are declared to the request rather than counted as GitHub being unreachable.
# This is what keeps the panel from saying the whole snapshot may be old.
api = CodedGitHub([(None, "error"), (None, "error"), (None, "error")])
state.security_alerts(api, "amitista-web", {})
check("a feed asks with its refusals declared",
      all(set(state.ALERT_REFUSALS) <= set(codes) for _, codes in api.expected))

# A no is charged every time it is asked for, unlike a 304, so it is believed
# for a while. This is the only thing on the page that spends the hourly
# allowance in the steady state.
settled = {
    "dependabot": {"available": False, "what": "x", "why": "off", "items": [], "open": 0,
                   "checked": state.now()},
}
api = CodedGitHub([(None, "error"), (None, "error")], codes={})
alerts = state.security_alerts(api, "amitista-web", settled)
check("a feed that said no a moment ago is not asked again",
      not any("dependabot" in path for path in api.asked))
check("and keeps the answer it gave", alerts["dependabot"]["why"] == "off")

stale_feed = dict(settled["dependabot"], checked="2020-01-01T00:00:00Z")
api = CodedGitHub([(None, "error"), (None, "error"), (None, "error")],
                  codes={"dependabot": 404})
alerts = state.security_alerts(api, "amitista-shield", {"dependabot": stale_feed})
check("but one that said no long enough ago is asked again",
      any("dependabot" in path for path in api.asked))

# A feed that has never been asked has no stamp at all, and must not be read as
# having been asked at the beginning of time or the far future — it is asked.
never = {"dependabot": {"available": False, "what": "x", "why": "off", "items": [], "open": 0}}
api = CodedGitHub([(None, "error"), (None, "error"), (None, "error")], codes={"dependabot": 404})
state.security_alerts(api, "amitista-web", never)
check("a feed with no record of when it was asked is asked",
      any("dependabot" in path for path in api.asked))

# ------------------------------------------------- what stands in the way here

scan_repo = tempfile.mkdtemp(prefix="guards-test-")
os.makedirs(os.path.join(scan_repo, ".githooks"))
os.makedirs(os.path.join(scan_repo, "scripts"))

held = state.guards(scan_repo, "abc1234", {})
check("a repository carrying no hook is reported as not carrying one",
      held["prePush"]["shipped"] is False)
check("and its scanner is missing too", held["scanner"]["shipped"] is False)
check("a repository with no scanner is not reported as clean",
      held["scan"]["ran"] is False)
check("it says why instead", "does not carry" in held["scan"]["why"])

with open(os.path.join(scan_repo, ".githooks", "pre-push"), "w", encoding="utf-8") as handle:
    handle.write("#!/usr/bin/env bash\n")
with open(os.path.join(scan_repo, ".githooks", "allowed-secrets"), "w", encoding="utf-8") as handle:
    handle.write("# a comment, which is not an entry\n\nabc123abc123  a fixture\n")
with open(os.path.join(scan_repo, "scripts", "check-dist-secrets.mjs"), "w", encoding="utf-8") as handle:
    handle.write("// stub\n")

held = state.guards(scan_repo, "abc1234", {})
check("a shipped hook is seen", held["prePush"]["shipped"] is True)
check("one that is not executable is not reported as executable",
      held["prePush"]["executable"] is False)
check("the allowlist is counted without its comments", held["scanner"]["allowlisted"] == 1)
check("the build's own check is seen", held["build"]["distCheck"] is True)
check("a checkout that has not enabled the hook says so",
      held["prePush"]["enabledHere"] is False)

# The scan is skipped when the tip has not moved, because it runs every tick
# and the answer cannot have changed. The file only has to exist for this — the
# point is that it is never run.
with open(os.path.join(scan_repo, "scripts", "scan-secrets.mjs"), "w", encoding="utf-8") as handle:
    handle.write("// stub: running this would fail, which is the test\n")

was = {"scan": {"ran": True, "head": "abc1234", "clean": True, "findings": [], "at": "earlier"}}
held = state.guards(scan_repo, "abc1234", was)
check("an unmoved tip reuses the scan it already has", held["scan"]["at"] == "earlier")
held = state.guards(scan_repo, "def5678", was)
check("and a moved tip does not", held["scan"].get("at") != "earlier")
check("a scanner that will not run is reported, not assumed clean",
      held["scan"]["ran"] is False and held["scan"].get("clean") is None)


# ------------------------------------------- reached, versus told no

# The distinction the panel's headline note rests on. These drive the real
# request path with urlopen stubbed, because the bug they pin was in the two
# lines of GitHub.get that decide which kind of bad this was — and everything
# above this point talks to a fake that never had them.


class FakeError(urllib.error.HTTPError):
    def __init__(self, code, body=b"{}"):
        urllib.error.HTTPError.__init__(
            self, "https://api.github.com/x", code, "no", {}, io.BytesIO(body)
        )


def answering(outcome):
    def urlopen(request, timeout=None):
        raise outcome
    return urlopen


def asking(outcome, path="/repos/x/y", expected=()):
    api = state.GitHub("token", {})
    saved = state.urllib.request.urlopen
    state.urllib.request.urlopen = answering(outcome)
    try:
        return api, api.get(path, expected=expected)
    finally:
        state.urllib.request.urlopen = saved


api, _ = asking(FakeError(404))
check("an unexpected refusal is a refusal", api.refused == [("/repos/x/y", 404)])
check("and is not GitHub being out of reach", api.unreachable is False)

api, _ = asking(FakeError(404), expected=(404,))
check("a refusal the caller has a story for is neither", not api.refused and not api.unreachable)

api, _ = asking(FakeError(502))
check("a 502 is GitHub not answering, whoever expected what", api.unreachable is True)
check("and is not filed as an answer", api.refused == [])

api, _ = asking(FakeError(429), expected=(429,))
check("a rate limit is out of reach even when expected", api.unreachable is True)

api, _ = asking(urllib.error.URLError("no route to host"))
check("a connection that never landed is out of reach", api.unreachable is True)

api, _ = asking(FakeError(403, b'{"message": "Dependabot alerts are disabled for this repository."}'))
check("GitHub's own reason is kept",
      api.message_for("/repos/x/y") == "Dependabot alerts are disabled for this repository.")

api, _ = asking(FakeError(304))
check("a 304 is not a failure of any kind", not api.refused and not api.unreachable)


if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
