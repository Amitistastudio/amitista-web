const WINDOW_DAYS = 90;
const INTERVAL_SECONDS = 300;
const SAMPLES_PER_DAY = 86400 / INTERVAL_SECONDS;

const CHECKS = [
  {
    id: 'site',
    name: 'Website',
    detail: 'amitista.com answers and returns the home page.',
  },
  {
    id: 'styles',
    name: 'Home page styling',
    detail:
      'The stylesheet the home page inlines is the one its security policy authorises. ' +
      'When these disagree the page loads as unstyled text and nothing else reports it.',
  },
  {
    id: 'contact',
    name: 'Enquiry delivery',
    detail:
      'The service behind the contact and estimate forms is running and has somewhere to ' +
      'deliver to. When it is down the forms still look like they worked.',
  },
  {
    id: 'routes',
    name: 'Page routing',
    detail: 'Real pages serve their own content, and unknown addresses return a 404.',
  },
  {
    id: 'tls',
    name: 'Certificate',
    detail: 'The HTTPS certificate has more than 14 days left before it expires.',
  },
  {
    id: 'disk',
    name: 'Disk',
    detail: 'The server has room left. A full disk takes the site, the forms and the backups together.',
  },
];

const FAILED_SAMPLES = 17;

function redOffset(index) {
  return 21 + index * 7;
}

function blipOffset(index) {
  return 5 + index * 3;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

const FRESH_SAMPLES = 9;

export function previewPayload(now = new Date(), mode = 'full') {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const fresh = mode === 'fresh';

  const checks = CHECKS.map((spec, index) => {
    const bad = redOffset(index);
    const blip = blipOffset(index);
    const days = [];

    for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
      const failed = offset === bad ? FAILED_SAMPLES : offset === blip ? 1 : 0;
      const date = isoDay(new Date(midnight - offset * 86400000));

      if (fresh) {
        const samples = offset === 0 ? FRESH_SAMPLES : 0;
        days.push({ d: date, s: samples ? 'partial' : 'none', u: samples, t: samples });
        continue;
      }

      days.push({
        d: date,
        s: failed ? 'down' : 'up',
        u: SAMPLES_PER_DAY - failed,
        t: SAMPLES_PER_DAY,
      });
    }

    const total = days.reduce((sum, day) => sum + day.t, 0);
    const up = days.reduce((sum, day) => sum + day.u, 0);

    return {
      ...spec,
      status: 'up',
      uptime: up === total ? 100 : Math.min(99.99, Math.round((up / total) * 10000) / 100),
      samples: total,
      days,
    };
  });

  return {
    generated: now.toISOString(),
    checked: now.toISOString(),
    windowDays: WINDOW_DAYS,
    intervalSeconds: INTERVAL_SECONDS,
    overall: 'operational',
    checks,
  };
}
