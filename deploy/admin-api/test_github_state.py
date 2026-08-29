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
import json
import os
import sys
import tempfile

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

    def get(self, path, have_cached=False):
        self.asked.append(path)
        if have_cached:
            self.conditional.append(path)
        return self.answers.pop(0)

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

# The tracking board's only source of "lines edited". Two things are pinned:
# GitHub answers 202 with an empty object while it is still computing the
# statistics, which must not read as "nobody has committed"; and every week
# since the repository was made comes back, most of them zeroes, so only the
# recent tail travels to the browser.

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
    "issues": [{"number": 2}],
    "commits": [{"sha": "abc"}],
    "branches": [{"name": "main"}],
    "runs": [{"status": "completed"}],
    "access": [{"login": "someone"}],
    "invites": [{"id": 7}],
    "stats": [{"login": "someone", "commits": 3}],
}
kept = state.inspect("x", "/nowhere-at-all", FakeGitHub([]), dict(detail_keys), False)
missing = [key for key in detail_keys if key not in kept]
check("everything GitHub answered for is carried to the next tick", missing == [])


class CountingGitHub(FakeGitHub):
    def get(self, path, have_cached=False):
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

if failures:
    print("\n%d of %d checks FAILED: %s" % (len(failures), total, ", ".join(failures)))
    sys.exit(1)
print("\nALL %d CHECKS PASSED" % total)
