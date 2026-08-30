#!/usr/bin/env python3

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

workspace = tempfile.mkdtemp(prefix="admin-review-test-")
os.environ["ADMIN_GITHUB_REVIEWS"] = os.path.join(workspace, "reviews.json")

import admin_review as review

passed = 0
failed = []


def check(what, ok):
    global passed
    if ok:
        passed += 1
        print("[PASS] %s" % what)
    else:
        failed.append(what)
        print("[FAIL] %s" % what)


PATHS = ["src/app.py", "src/util.py"]


def parse(text, paths=PATHS):
    return review.parse(text, paths)


good = parse(
    '{"summary": "Adds a retry.", "findings": '
    '[{"file": "src/app.py", "line": 12, "severity": "high", "note": "Off by one."}]}'
)
check("a plain answer is read", good["summary"] == "Adds a retry.")
check("and its finding is kept", good["findings"][0]["file"] == "src/app.py")
check("with its line", good["findings"][0]["line"] == 12)

check(
    "an answer wrapped in a code fence is still read",
    parse('```json\n{"summary": "Fine.", "findings": []}\n```')["summary"] == "Fine.",
)
check(
    "and one wrapped in prose",
    parse('Sure! {"summary": "Fine.", "findings": []} Hope that helps.')["summary"] == "Fine.",
)


def refuses(text):
    try:
        parse(text)
    except review.ReviewError:
        return True
    return False


check("an answer that is not JSON at all is refused", refuses("I cannot help with that."))
check("so is one that is not an object", refuses("[1, 2, 3]"))
check("so is broken JSON", refuses('{"summary": "oops"'))
check("and so is one with no summary", refuses('{"summary": "", "findings": []}'))


invented = parse(
    '{"summary": "Ok.", "findings": [{"file": "src/nowhere.py", "severity": "high", '
    '"note": "Something."}]}'
)
check("a file the model was not shown is not printed as a location", invented["findings"][0]["file"] is None)
check("but the note it came with is kept", invented["findings"][0]["note"] == "Something.")

check(
    "a severity outside the three is brought back to the quietest",
    parse('{"summary": "Ok.", "findings": [{"file": "src/app.py", "severity": "CRITICAL", '
          '"note": "n"}]}')["findings"][0]["severity"] == "low",
)
check(
    "a line that is not a positive number is dropped rather than shown",
    parse('{"summary": "Ok.", "findings": [{"file": "src/app.py", "line": -3, "note": "n"}]}'
          )["findings"][0]["line"] is None,
)
check(
    "a finding with no note is not a finding",
    parse('{"summary": "Ok.", "findings": [{"file": "src/app.py", "note": "  "}]}')["findings"] == [],
)
check(
    "findings that are not objects are dropped",
    parse('{"summary": "Ok.", "findings": ["a string", null, 7]}')["findings"] == [],
)

many = parse(
    '{"summary": "Ok.", "findings": [%s]}'
    % ",".join('{"file": "src/app.py", "note": "n%d"}' % n for n in range(review.MAX_FINDINGS + 8))
)
check("the number of findings is capped", len(many["findings"]) == review.MAX_FINDINGS)

ordered = parse(
    '{"summary": "Ok.", "findings": ['
    '{"file": "src/app.py", "severity": "low", "note": "quiet"},'
    '{"file": "src/app.py", "severity": "high", "note": "loud"}]}'
)
check("the most serious finding is first", ordered["findings"][0]["note"] == "loud")

long_note = parse(
    '{"summary": "Ok.", "findings": [{"file": "src/app.py", "note": "%s"}]}' % ("x" * 900)
)
check("a runaway note is cut", len(long_note["findings"][0]["note"]) == review.MAX_NOTE_CHARS)


pull = {
    "number": 4,
    "title": "Retry the relay",
    "head": "fix/relay",
    "base": "main",
    "additions": 10,
    "deletions": 2,
    "files": 2,
    "body": "Because it drops messages.",
    "changed": [
        {"path": "src/app.py", "status": "modified", "added": 9, "removed": 2, "patch": "@@ real diff"},
        {"path": "logo.png", "status": "modified", "added": 0, "removed": 0},
    ],
}
question = review.prompt_for(pull, "amitista-web")
check("the prompt carries the diff", "@@ real diff" in question)
check("and the title", "Retry the relay" in question)
check("and what the author wrote", "drops messages" in question)
check("a file with no diff is still listed", "logo.png" in question)


def status_of(pull_row):
    os.environ["ADMIN_AI_KEY"] = "test-key"
    try:
        review.review(pull_row, "r")
    except review.ReviewError as error:
        return error.status
    finally:
        os.environ.pop("ADMIN_AI_KEY", None)
    return None


check(
    "a pull request with no diff collected is refused rather than reviewed on its names alone",
    status_of({"number": 1, "changed": [{"path": "a.py"}]}) == 409,
)

os.environ.pop("ADMIN_AI_KEY", None)
check("with no key configured, the reviewer says so", not review.configured())
try:
    review.review(pull, "r")
    unconfigured = None
except review.ReviewError as error:
    unconfigured = error.status
check("and refuses with a 503 rather than pretending", unconfigured == 503)


answer = {"summary": "Ok.", "findings": [], "sha": "abc123", "generated": 10}
review.remember("amitista-web", 4, answer)
check("a review is found again at the same commit", review.cached("amitista-web", 4, "abc123") == answer)
check("and not at a different one", review.cached("amitista-web", 4, "def456") is None)
check("nor for a pull request that has none", review.cached("amitista-web", 9, "abc123") is None)

review.remember("amitista-web", 4, {"summary": "Newer.", "findings": [], "sha": "def456", "generated": 20})
check("a new commit replaces the review of the old one", review.cached("amitista-web", 4, "abc123") is None)
check("and the new one is found", review.cached("amitista-web", 4, "def456")["summary"] == "Newer.")

for n in range(review.MAX_CACHED + 10):
    review.remember("amitista-web", 100 + n, {"summary": "s", "findings": [], "sha": "s%d" % n, "generated": n})
check(
    "the cache does not grow without limit",
    len(review._read_cache()) == review.MAX_CACHED,
)


print()
if failed:
    print("%d FAILED, %d passed" % (len(failed), passed))
    for what in failed:
        print("  - %s" % what)
    sys.exit(1)
print("ALL %d CHECKS PASSED" % passed)
