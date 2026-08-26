'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEEP = 2000;
const SWEEP_EVERY = 200;
const BUFFER_MAX = 500;

function createFlagLog(file, { flushMs = 2000 } = {}) {
  const pending = [];
  let written = 0;
  let dropped = 0;
  let timer = null;

  function trim() {
    let lines;
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    } catch {
      return;
    }
    if (lines.length <= KEEP) return;
    const kept = `${lines.slice(-KEEP).join('\n')}\n`;
    const temporary = `${file}.tmp`;
    try {
      fs.writeFileSync(temporary, kept, { mode: 0o640 });
      fs.renameSync(temporary, file);
    } catch {
      try {
        fs.unlinkSync(temporary);
      } catch {
        /* nothing left to clean up */
      }
    }
  }

  function flush() {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `${batch.map((entry) => JSON.stringify(entry)).join('\n')}\n`, {
        mode: 0o640,
      });
    } catch {
      dropped += batch.length;
      return;
    }
    written += batch.length;
    if (written % SWEEP_EVERY < batch.length) trim();
  }

  function record(entry) {
    if (pending.length >= BUFFER_MAX) {
      dropped += 1;
      return;
    }
    pending.push(entry);
  }

  function read(limit) {
    let lines;
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    } catch {
      return [];
    }
    const out = [];
    for (const line of lines.slice(-limit)) {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* a half-written line is not worth the whole feed */
      }
    }
    return out;
  }

  function clear() {
    pending.length = 0;
    try {
      fs.writeFileSync(file, '', { mode: 0o640 });
    } catch {
      return false;
    }
    return true;
  }

  function start() {
    if (timer) return;
    timer = setInterval(flush, flushMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    flush();
  }

  return {
    record,
    read,
    clear,
    flush,
    start,
    stop,
    file,
    stats: () => ({ file, written, dropped, pending: pending.length }),
  };
}

module.exports = { createFlagLog, KEEP };
