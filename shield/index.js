'use strict';

const { scan } = require('./src/scan');
const { render } = require('./src/report');
const runtime = require('./src/runtime/protect');

// Requiring shield installs the sink hooks immediately, before the app's own
// route files capture references to child_process, fs or fetch. Nothing is
// inspected until protect() is mounted — the hooks pass straight through when
// there is no active request.
runtime.install();

module.exports = {
  protect: runtime.protect,
  errorHandler: runtime.errorHandler,
  harden: runtime.harden,
  // Carries the request context across a boundary AsyncLocalStorage does not
  // follow — a job queue, a worker, a listener registered at startup. Work
  // handed over without it runs with every sink hook inert.
  bind: runtime.bind,
  selfTest: runtime.selfTest,
  health: runtime.health,
  feed: runtime.feed,
  refreshFeed: runtime.refreshFeed,
  baselines: runtime.baselines,
  findings: runtime.findings,
  // Totals that outlive the findings() ring buffer, and a way to apply a block
  // this process did not decide on — the two things a deployment with more than
  // one worker needs to see the whole picture.
  stats: runtime.stats,
  block: runtime.block,
  clear: runtime.clear,
  stop: runtime.stop,
  install: runtime.install,
  ShieldBlocked: runtime.ShieldBlocked,
  BLOCK_PAGE: runtime.BLOCK_PAGE,
  scan,
  render,
};
