'use strict';

// Compiling a pattern that arrived over the network and then running it against
// attacker-controlled request data is the most dangerous thing in this package.
// A pattern like /(a+)+$/ is not a typo an author would notice, and shipping one
// in a feed would hang every customer's event loop on the first request that
// hits it — a denial of service delivered by the security tool, to everybody at
// once, with no bad actor involved.
//
// JavaScript cannot interrupt a running regex, so the only defence is to refuse
// the pattern before it ever sees real input. Two independent gates do that:
// a static gate on what the source is allowed to look like, and an empirical
// gate that actually runs the pattern against strings designed to make a
// backtracking engine explode. The empirical one is the load-bearing gate; the
// static one just keeps the obvious cases from costing a benchmark.

const MAX_SOURCE = 400;
const ALLOWED_FLAGS = /^[imsu]*$/;

// A budget generous enough that a slow box under load does not reject a sound
// pattern, and small enough that anything genuinely superlinear blows straight
// through it. A linear pattern finishes the whole ladder below in well under a
// millisecond, so the gap between pass and fail is orders of magnitude.
const BUDGET_MS = 20;

// The subtle part. Probing for catastrophic backtracking means deliberately
// running the pattern on its worst input, which is the same thing the gate
// exists to prevent — so a naive probe at, say, 2000 characters hangs the gate
// itself on the first exponential pattern it is asked about, and the process
// never comes back. That is strictly worse than not checking.
//
// The ladder below is what makes the check safe to perform. Lengths climb in
// small steps and the budget is checked after *every* rung, so a pattern is
// rejected at the first length where it misbehaves and the longer rungs are
// never reached. An exponential pattern costs roughly 2^n, so it is caught at
// n=28 while a single probe is still milliseconds; a quadratic or cubic one is
// invisible at n=28 but obvious by n=200. Because each rung only runs after the
// previous one came in under budget, the worst a single probe can cost is a
// small multiple of the budget rather than an unbounded amount of time.
const LENGTHS = [20, 28, 64, 200, 400, 800, 1400, 2000];

// Alphabets chosen so a pattern anchored on one kind of character still meets
// a run it can chew on. The trailing character forces the match to fail, which
// is what makes a backtracking engine explore every path before giving up —
// a matching input returns on the first success and hides the problem.
const ALPHABETS = ['a', '0', ' ', '/'];
const TERMINATOR = '!';

const probeAt = (alphabet, length) => alphabet.repeat(length) + TERMINATOR;

// Catastrophic — exponential — backtracking needs a repeat applied to something
// that can itself match the same text more than one way: (a+)+, (?:a|aa)+,
// ([a-z]+\s?)*. In regex syntax that always means a quantifier attached to a
// *group*. Quantifiers on plain atoms and character classes — \d+, [0-9]{16},
// .* — cannot produce it; the worst they manage is polynomial, which the
// subject cap below keeps bounded.
//
// So the grammar is restricted rather than analysed: a group may be followed by
// `?` and nothing else. That makes the exponential case unrepresentable instead
// of merely unlikely, which matters enormously here, because the probes further
// down have to *run* the pattern to time it. Left to meet an exponential
// pattern, the check meant to catch it is what hangs the process. Ruling the
// shape out first is what makes measuring the rest safe.
//
// It costs a little expressiveness — (abc){2} is refused although it is
// harmless — and that is the right trade for a value that is written once by
// us and executed inside every customer's request path.
function quantifiedGroup(source) {
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') {
      inClass = true;
      continue;
    }
    if (char === ')') {
      const next = source[i + 1];
      if (next === '*' || next === '+' || next === '{') return true;
    }
  }
  return false;
}

function staticallySuspect(source) {
  if (source.length > MAX_SOURCE) return 'longer than the source limit';
  if (quantifiedGroup(source)) return 'repeats a group, which can backtrack exponentially';
  return null;
}

// Climbs the ladder and returns a rejection reason, or null if the pattern
// stayed fast the whole way up. Lengths are the outer loop so that every
// alphabet is tried at a short length before any of them is tried at a long
// one — the ordering that keeps an exponential pattern from ever reaching a
// rung that would hang.
function tooSlow(re) {
  for (const length of LENGTHS) {
    for (const alphabet of ALPHABETS) {
      const probe = probeAt(alphabet, length);
      const started = process.hrtime.bigint();
      try {
        re.test(probe);
      } catch {
        return 'threw while being probed';
      }
      // lastIndex survives a test() and would make the next probe start
      // mid-string, which is not the case being measured.
      re.lastIndex = 0;
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      if (elapsed > BUDGET_MS) {
        return `took ${elapsed.toFixed(1)}ms on a ${length}-character backtracking probe, over the ${BUDGET_MS}ms budget`;
      }
    }
  }
  return null;
}

// Returns a compiled RegExp, or null with the reason recorded in `rejected`.
// Never throws: a malformed entry in a feed must cost that one rule, not the
// whole document.
function compile(source, flags = '', rejected = []) {
  const note = (reason) => {
    rejected.push({ source, reason });
    return null;
  };

  if (typeof source !== 'string' || !source) return note('not a string');
  if (typeof flags !== 'string' || !ALLOWED_FLAGS.test(flags)) return note('unsupported flags');

  const suspect = staticallySuspect(source);
  if (suspect) return note(suspect);

  let re;
  try {
    re = new RegExp(source, flags);
  } catch (error) {
    return note(`will not compile: ${error.message}`);
  }

  const slow = tooSlow(re);
  if (slow) return note(slow);

  return re;
}

// Even a pattern that passed the gate above only ever sees a bounded prefix of
// a value. The gate proves the pattern is not exponential on the probes it was
// given; this makes the cost of being wrong bounded anyway.
const MAX_SUBJECT = 8 * 1024;

const subject = (value) => (
  typeof value === 'string' && value.length > MAX_SUBJECT
    ? value.slice(0, MAX_SUBJECT)
    : value
);

module.exports = { compile, subject, MAX_SOURCE, MAX_SUBJECT, BUDGET_MS };
