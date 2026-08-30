#!/usr/bin/env python3

import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import errorwatch as ew


def at(minutes_ago):
    return ew.now() - minutes_ago * 60


class Signatures(unittest.TestCase):
    def test_numbers_and_ids_collapse(self):
        one = ew.signature("upstream timed out (110: Connection timed out) while reading, request 48213")
        two = ew.signature("upstream timed out (110: Connection timed out) while reading, request 91777")
        self.assertEqual(one, two)

    def test_hex_ids_collapse(self):
        self.assertEqual(ew.signature("board=e0e098a85400f4b2 failed"), ew.signature("board=a1b2c3d4e5f60718 failed"))

    def test_long_lines_are_cut(self):
        self.assertLessEqual(len(ew.signature("x" * 500)), 110)


class Stamps(unittest.TestCase):
    def test_access_log_time(self):
        self.assertEqual(ew.parse_access_time("29/Aug/2026:23:31:26 +0000"), 1788046286)

    def test_nginx_error_time(self):
        self.assertEqual(ew.parse_nginx_time("2026/08/29 22:54:01"), 1788044041)

    def test_iso_with_and_without_zone(self):
        self.assertEqual(ew.parse_iso("2026-08-08T12:42:19.306Z"), ew.parse_iso("2026-08-08T12:42:19.306+00:00"))

    def test_nonsense_is_none_not_a_crash(self):
        self.assertIsNone(ew.parse_access_time("not a date"))
        self.assertIsNone(ew.parse_nginx_time(""))
        self.assertIsNone(ew.parse_iso("yesterday"))


class Reading(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "log")
        self.state = ew.blank_state()

    def write(self, text, mode="a"):
        with open(self.path, mode, encoding="utf-8") as handle:
            handle.write(text)

    def test_first_sight_is_a_starting_line_not_a_backlog(self):
        self.write("old one\nold two\n", "w")
        self.assertEqual(ew.read_new(self.state, "t", self.path), [])
        self.write("new\n")
        self.assertEqual(ew.read_new(self.state, "t", self.path), ["new"])

    def test_a_half_written_line_waits_for_the_rest(self):
        self.write("", "w")
        ew.read_new(self.state, "t", self.path)
        self.write("complete\npart")
        self.assertEqual(ew.read_new(self.state, "t", self.path), ["complete"])
        self.write("ial\n")
        self.assertEqual(ew.read_new(self.state, "t", self.path), ["partial"])

    def test_rotation_starts_the_new_file_from_the_top(self):
        self.write("first\n", "w")
        ew.read_new(self.state, "t", self.path)
        os.rename(self.path, self.path + ".1")
        self.write("after rotation\n", "w")
        self.assertEqual(ew.read_new(self.state, "t", self.path), ["after rotation"])

    def test_a_missing_file_is_not_an_error(self):
        self.assertEqual(ew.read_new(self.state, "gone", os.path.join(self.dir, "nope")), [])


class Parsing(unittest.TestCase):
    def setUp(self):
        self.state = ew.blank_state()
        self.dir = tempfile.mkdtemp()

    def feed(self, name, source_key, lines, scan):
        path = os.path.join(self.dir, name)
        open(path, "w", encoding="utf-8").close()
        held = ew.SOURCES[source_key]
        ew.SOURCES[source_key] = path
        try:
            scan(self.state)
            with open(path, "a", encoding="utf-8") as handle:
                handle.write("".join(f"{line}\n" for line in lines))
            scan(self.state)
        finally:
            ew.SOURCES[source_key] = held

    def counted(self, source):
        return sum(b["n"].get(source, 0) for b in self.state["buckets"].values())

    def test_access_log_splits_5xx_from_4xx(self):
        stamp = time.strftime("%d/%b/%Y:%H:%M:%S +0000", time.gmtime())
        self.feed(
            "access",
            "access",
            [
                f'1.2.3.4 - - [{stamp}] "GET /api/admin/boards HTTP/2.0" 500 151 "-" "-"',
                f'1.2.3.4 - - [{stamp}] "GET /missing HTTP/2.0" 404 20 "-" "-"',
                f'1.2.3.4 - - [{stamp}] "GET / HTTP/2.0" 200 20 "-" "-"',
            ],
            ew.scan_access,
        )
        self.assertEqual(self.counted("nginx5xx"), 1)
        self.assertEqual(self.counted("nginx4xx"), 1)

    def test_a_query_string_does_not_split_one_path_into_many(self):
        stamp = time.strftime("%d/%b/%Y:%H:%M:%S +0000", time.gmtime())
        self.feed(
            "access2",
            "access",
            [f'1.2.3.4 - - [{stamp}] "GET /api/x?id={n} HTTP/2.0" 500 1 "-" "-"' for n in range(3)],
            ew.scan_access,
        )
        sigs = [s for bucket in self.state["buckets"].values() for s in (bucket["sig"].get("nginx5xx") or {})]
        self.assertEqual(len(set(sigs)), 1)

    def test_the_status_code_survives_normalisation(self):
        stamp = time.strftime("%d/%b/%Y:%H:%M:%S +0000", time.gmtime())
        self.feed("access3", "access", [f'1.2.3.4 - - [{stamp}] "GET /.env HTTP/2.0" 404 20 "-" "-"'], ew.scan_access)
        sigs = [s for bucket in self.state["buckets"].values() for s in (bucket["sig"].get("nginx4xx") or {})]
        self.assertEqual(sigs, ["404 GET /.env"])

    def test_a_500_and_a_502_on_one_path_stay_apart(self):
        stamp = time.strftime("%d/%b/%Y:%H:%M:%S +0000", time.gmtime())
        self.feed("access4", "access", [f'1.2.3.4 - - [{stamp}] "GET /api/x HTTP/2.0" {code} 1 "-" "-"' for code in (500, 502)], ew.scan_access)
        sigs = [s for bucket in self.state["buckets"].values() for s in (bucket["sig"].get("nginx5xx") or {})]
        self.assertEqual(sorted(sigs), ["500 GET /api/x", "502 GET /api/x"])

    def test_a_nonsense_request_line_is_named_as_one(self):
        stamp = time.strftime("%d/%b/%Y:%H:%M:%S +0000", time.gmtime())
        self.feed("access5", "access", [f'1.2.3.4 - - [{stamp}] "-" 400 0 "-" "-"'], ew.scan_access)
        sigs = [s for bucket in self.state["buckets"].values() for s in (bucket["sig"].get("nginx4xx") or {})]
        self.assertEqual(sigs, ["400 (malformed request)"])

    def test_nginx_error_log_ignores_warnings(self):
        stamp = time.strftime("%Y/%m/%d %H:%M:%S", time.gmtime())
        self.feed(
            "err",
            "nginx_error",
            [
                f'{stamp} [error] 111#111: *1 upstream timed out, client: 1.2.3.4, server: amitista.com',
                f'{stamp} [warn] 111#111: *2 something milder, client: 1.2.3.4',
            ],
            ew.scan_nginx_error,
        )
        self.assertEqual(self.counted("nginxError"), 1)

    def test_csp_report_is_read_out_of_its_nested_json(self):
        stamp = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
        report = json.dumps({"body": {"effectiveDirective": "script-src-elem", "blockedURL": "inline"}})
        self.feed("csp", "csp", [json.dumps({"t": stamp, "report": report})], ew.scan_csp)
        self.assertEqual(self.counted("csp"), 1)

    def test_shield_flag_keeps_its_severity(self):
        stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.feed("shield", "shield", [json.dumps({"time": stamp, "severity": "high", "id": "nosql-operator", "path": "/orders"})], ew.scan_shield)
        sigs = [s for bucket in self.state["buckets"].values() for s in (bucket["sig"].get("shield") or {})]
        self.assertTrue(any("high" in s for s in sigs), sigs)

    def test_a_successful_api_call_is_not_a_refusal(self):
        stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.feed(
            "api",
            "api",
            [json.dumps({"at": stamp, "status": 401, "kind": "unknown", "path": "/v1/x"}), json.dumps({"at": stamp, "status": 200, "path": "/v1/x"})],
            ew.scan_api,
        )
        self.assertEqual(self.counted("api"), 1)

    def test_rubbish_lines_are_skipped_rather_than_fatal(self):
        self.feed("junk", "csp", ["{not json", ""], ew.scan_csp)
        self.assertEqual(self.counted("csp"), 0)


class Windows(unittest.TestCase):
    def setUp(self):
        self.state = ew.blank_state()

    def test_only_the_asked_for_minutes_are_counted(self):
        ew.add(self.state, at(40), "nginx5xx", "old")
        ew.add(self.state, at(5), "nginx5xx", "recent")
        recent = ew.window(self.state, at(15), ew.now())
        self.assertEqual(recent["counts"]["nginx5xx"], 1)
        self.assertEqual(recent["errors"], 1)

    def test_context_sources_are_not_counted_as_errors(self):
        ew.add(self.state, at(1), "nginx4xx", "scanner")
        ew.add(self.state, at(1), "csp", "inline")
        held = ew.window(self.state, at(15), ew.now())
        self.assertEqual(held["errors"], 0)
        self.assertEqual(held["counts"]["nginx4xx"], 1)

    def test_rate_limiting_is_not_an_error(self):
        ew.add(self.state, at(1), "rateLimit", "limiting requests by zone amitista_csp")
        ew.add(self.state, at(1), "shield", "high nosql-operator")
        held = ew.window(self.state, at(15), ew.now())
        self.assertEqual(held["errors"], 0)
        self.assertEqual(held["counts"]["rateLimit"], 1)

    def test_top_signatures_come_back_in_order(self):
        for _ in range(3):
            ew.add(self.state, at(2), "app", "loud")
        ew.add(self.state, at(2), "app", "quiet")
        top = ew.window(self.state, at(10), ew.now())["top"]["app"]
        self.assertEqual(top[0], ("loud", 3))

    def test_old_buckets_are_dropped(self):
        ew.add(self.state, at(ew.BUCKET_TTL_MINUTES + 30), "app", "ancient")
        ew.add(self.state, at(1), "app", "now")
        ew.prune(self.state)
        self.assertEqual(len(self.state["buckets"]), 1)


class Digests(unittest.TestCase):
    def setUp(self):
        self.state = ew.blank_state()
        self.sent = []
        self.held = ew.post
        ew.post = lambda state, payload, dry_run=False: (self.sent.append(payload), True)[1]

    def tearDown(self):
        ew.post = self.held

    def test_a_period_produces_one_summary_for_each_audience(self):
        ew.add(self.state, at(5), "nginx5xx", "500 GET /api/x")
        ew.add(self.state, at(5), "rateLimit", "limiting requests")
        ew.add(self.state, at(5), "nginx4xx", "404 GET /.env")
        ew.maybe_digest(self.state, force=True)
        kinds = [card["kind"] for card in self.sent]
        self.assertEqual(kinds, ["digest", "webdigest"])
        errors, website = self.sent
        self.assertEqual(errors["counts"]["nginx5xx"], 1)
        self.assertNotIn("rateLimit", errors["counts"])
        self.assertEqual(website["counts"]["rateLimit"], 1)
        self.assertNotIn("nginx5xx", website["counts"])
        self.assertEqual(website["total"], 2)

    def test_the_clock_only_moves_once_a_period_has_passed(self):
        ew.maybe_digest(self.state, force=True)
        self.sent.clear()
        ew.maybe_digest(self.state)
        self.assertEqual(self.sent, [])


class Arithmetic(unittest.TestCase):
    def test_nothing_either_side_is_not_a_change(self):
        self.assertIsNone(ew.change(0, 0))

    def test_something_from_nothing_is_unbounded(self):
        self.assertEqual(ew.change(0, 4), float("inf"))

    def test_a_tripling_is_two_hundred_percent(self):
        self.assertAlmostEqual(ew.change(3, 9), 200.0)

    def test_an_improvement_is_negative(self):
        self.assertAlmostEqual(ew.change(10, 5), -50.0)


class Releases(unittest.TestCase):
    def setUp(self):
        self.state = ew.blank_state()
        self.sent = []
        self.held = ew.post
        ew.post = lambda state, payload, dry_run=False: (self.sent.append(payload), True)[1]

    def tearDown(self):
        ew.post = self.held

    def deploy(self, minutes_ago):
        moment = at(minutes_ago)
        return {"at": moment, "due": moment + ew.GRACE_SECONDS + ew.WINDOW_MINUTES * 60, "repo": "amitista-web", "to": "b" * 40, "subject": "Log GitHub into Discord"}

    def test_a_deploy_still_settling_is_not_reported(self):
        self.state["pending"] = [self.deploy(2)]
        ew.settle(self.state)
        self.assertEqual(self.sent, [])
        self.assertEqual(len(self.state["pending"]), 1)

    def test_a_settled_deploy_compares_the_two_windows(self):
        deploy = self.deploy(40)
        moment = deploy["at"]
        for _ in range(3):
            ew.add(self.state, moment - 300, "nginx5xx", "500 GET /api/x")
        for _ in range(9):
            ew.add(self.state, moment + ew.GRACE_SECONDS + 60, "nginx5xx", "500 GET /api/x")
        self.state["pending"] = [deploy]
        ew.settle(self.state)
        card = self.sent[0]
        self.assertEqual(card["kind"], "release")
        self.assertEqual(card["verdict"], "worse")
        row = next(r for r in card["rows"] if r["source"] == "nginx5xx")
        self.assertEqual((row["before"], row["after"]), (3, 9))
        self.assertAlmostEqual(row["pct"], 200.0)
        self.assertEqual(self.state["pending"], [])

    def test_the_grace_window_keeps_restart_noise_off_the_release(self):
        deploy = self.deploy(40)
        ew.add(self.state, deploy["at"] + 5, "nginx5xx", "502 GET /")
        self.state["pending"] = [deploy]
        ew.settle(self.state)
        self.assertEqual(self.sent[0]["after"]["nginx5xx"], 0)

    def test_a_card_is_always_valid_json(self):
        deploy = self.deploy(40)
        ew.add(self.state, deploy["at"] + ew.GRACE_SECONDS + 60, "app", "from nothing")
        self.state["pending"] = [deploy]
        ew.settle(self.state)
        card = self.sent[0]
        json.dumps(card, allow_nan=False)
        row = next(r for r in card["rows"] if r["source"] == "app")
        self.assertEqual((row["before"], row["after"], row["pct"]), (0, 1, None))

    def test_a_quiet_deploy_reads_as_clean(self):
        self.state["pending"] = [self.deploy(40)]
        ew.settle(self.state)
        self.assertEqual(self.sent[0]["verdict"], "clean")

    def test_fewer_errors_after_is_not_worse(self):
        deploy = self.deploy(40)
        for _ in range(6):
            ew.add(self.state, deploy["at"] - 120, "app", "boom")
        ew.add(self.state, deploy["at"] + ew.GRACE_SECONDS + 60, "app", "boom")
        self.state["pending"] = [deploy]
        ew.settle(self.state)
        self.assertEqual(self.sent[0]["verdict"], "steady")


class Spikes(unittest.TestCase):
    def setUp(self):
        self.state = ew.blank_state()
        self.sent = []
        self.held = ew.post
        ew.post = lambda state, payload, dry_run=False: (self.sent.append(payload), True)[1]

    def tearDown(self):
        ew.post = self.held

    def load(self, count, minutes_ago=2, source="nginx5xx"):
        for _ in range(count):
            ew.add(self.state, at(minutes_ago), source, "500 GET /api/x")

    def test_a_handful_of_errors_is_not_a_spike(self):
        self.load(ew.SPIKE_FLOOR - 1)
        ew.check_spike(self.state)
        self.assertEqual(self.sent, [])

    def test_a_jump_from_nothing_is_reported(self):
        self.load(ew.SPIKE_FLOOR + 2)
        ew.check_spike(self.state)
        self.assertEqual(self.sent[0]["kind"], "spike")

    def test_a_busy_but_normal_period_is_not_a_spike(self):
        for minute in range(10, 65):
            self.load(4, minutes_ago=minute)
        self.load(8)
        ew.check_spike(self.state)
        self.assertEqual(self.sent, [])

    def test_a_settling_deploy_owns_its_own_window(self):
        self.state["pending"] = [{"at": at(2), "due": ew.now() + 600}]
        self.load(ew.SPIKE_FLOOR + 10)
        ew.check_spike(self.state)
        self.assertEqual(self.sent, [])

    def test_one_spike_is_not_reported_twice_over(self):
        self.load(ew.SPIKE_FLOOR + 2)
        ew.check_spike(self.state)
        self.load(ew.SPIKE_FLOOR + 2, minutes_ago=1)
        ew.check_spike(self.state)
        self.assertEqual(len(self.sent), 1)


class Delivery(unittest.TestCase):
    def setUp(self):
        self.state = ew.blank_state()
        self.held = ew.post

    def tearDown(self):
        ew.post = self.held

    def test_an_undelivered_card_is_kept_and_sent_next_time(self):
        ew.post = lambda state, payload, dry_run=False: False
        ew.send(self.state, {"kind": "digest"})
        self.assertEqual(len(self.state["outbox"]), 1)
        landed = []
        ew.post = lambda state, payload, dry_run=False: (landed.append(payload), True)[1]
        ew.drain(self.state)
        self.assertEqual(self.state["outbox"], [])
        self.assertEqual(len(landed), 1)

    def test_the_outbox_does_not_grow_without_end(self):
        ew.post = lambda state, payload, dry_run=False: False
        for _ in range(ew.OUTBOX_MAX + 20):
            ew.send(self.state, {"kind": "digest"})
        self.assertEqual(len(self.state["outbox"]), ew.OUTBOX_MAX)


class Persistence(unittest.TestCase):
    def test_state_survives_a_round_trip(self):
        path = os.path.join(tempfile.mkdtemp(), "state.json")
        state = ew.blank_state()
        ew.add(state, ew.now(), "app", "boom")
        state["cursor"] = "s=abc"
        ew.save_state(path, state)
        back = ew.load_state(path)
        self.assertEqual(back["cursor"], "s=abc")
        self.assertEqual(ew.window(back, at(5), ew.now())["counts"]["app"], 1)

    def test_a_first_run_does_not_summarise_a_period_it_never_saw(self):
        held, ew.post = ew.post, lambda state, payload, dry_run=False: (sent.append(payload), True)[1]
        sent = []
        try:
            directory = tempfile.mkdtemp()
            ew.main(["--state", directory])
            self.assertEqual([card for card in sent if card["kind"] == "digest"], [])
            state = ew.load_state(os.path.join(directory, "state.json"))
            self.assertGreater(state["lastDigest"], 0)
        finally:
            ew.post = held

    def test_a_corrupt_state_file_starts_over_rather_than_crashing(self):
        path = os.path.join(tempfile.mkdtemp(), "state.json")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write("{ not json")
        self.assertEqual(ew.load_state(path), ew.blank_state())


if __name__ == "__main__":
    unittest.main(verbosity=2)
