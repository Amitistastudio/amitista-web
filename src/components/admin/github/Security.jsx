import React from 'react';
import { ShieldHalf, TriangleAlert, KeyRound, FileSearch, Rocket } from 'lucide-react';
import { formatAgo } from '../../../lib/admin';
import { Empty, Figure, Panel, Pill, Row } from '../ui';
import { GithubLink, count, listOf, repositoriesIn } from './shared';

const SHOWN = 6;

// Worst first, and the words are GitHub's own. A dependabot alert and a code
// scanning alert use different vocabularies for the same idea, so both are
// looked up here rather than compared as strings anywhere else.
const SEVERITY = ['critical', 'high', 'medium', 'moderate', 'low', 'warning', 'note'];
const severityRank = (level) => {
  const at = SEVERITY.indexOf(String(level ?? '').toLowerCase());
  return at === -1 ? SEVERITY.length : at;
};
const severityTone = (level) => {
  const rank = severityRank(level);
  return rank <= 1 ? 'rose' : rank <= 3 ? 'amber' : 'neutral';
};

const FEEDS = [
  ['dependabot', 'Dependabot'],
  ['secretScanning', 'Secret scanning'],
  ['codeScanning', 'Code scanning'],
];

// What the scanner knows, in the four groups somebody actually asks about. The
// rules themselves come from the scanner that shipped — this only decides which
// heading each falls under, so a rule added there appears here without anybody
// remembering to come and say so.
const FAMILIES = [
  ['Private keys', (rule) => /private-key|putty/.test(rule)],
  ['API keys', (rule) => /key$|key-|-key/.test(rule)],
  ['Tokens', (rule) => /token/.test(rule)],
  ['Webhooks and URLs', (rule) => /webhook|url/.test(rule)],
];
const familyOf = (rule) => FAMILIES.find(([, matches]) => matches(rule))?.[0] ?? 'Everything else';

const guardsOf = (repo) => (repo?.guards && typeof repo.guards === 'object' ? repo.guards : null);
const alertsOf = (repo) => (repo?.alerts && typeof repo.alerts === 'object' ? repo.alerts : {});

// Every finding the box's own scan turned up, across the three, each keeping
// the repository it came from so a row can name it.
function findings(repositories) {
  return repositories.flatMap((repo) => {
    const scan = guardsOf(repo)?.scan;
    if (!scan?.ran) return [];
    return (Array.isArray(scan.findings) ? scan.findings : []).map((finding) => ({
      ...finding,
      repo: repo.name,
    }));
  });
}

// An alert feed that is unavailable is not a feed with nothing in it. Counting
// the two together would report a repository with no secret scanning at all as
// having no secrets, which is the one mistake this section exists to avoid.
function alertTally(repositories) {
  let open = 0;
  let worst = null;
  let unavailable = 0;
  repositories.forEach((repo) => {
    const alerts = alertsOf(repo);
    FEEDS.forEach(([feed]) => {
      const held = alerts[feed];
      if (!held) return;
      if (held.available === false) {
        unavailable += 1;
        return;
      }
      open += held.open ?? 0;
      (held.items ?? []).forEach((item) => {
        if (worst === null || severityRank(item.severity) < severityRank(worst)) {
          worst = item.severity;
        }
      });
    });
  });
  return { open, worst, unavailable };
}

function ScanRow({ repo }) {
  const scan = guardsOf(repo)?.scan;

  if (!scan) {
    return (
      <Row label={repo.name} value="no checkout on this box" tone="text-rose-400" />
    );
  }
  if (!scan.ran) {
    return <Row label={repo.name} value={scan.why ?? 'not scanned'} tone="text-amber-300" />;
  }
  return (
    <Row
      label={repo.name}
      value={
        <span className="text-[12px]">
          {scan.clean ? 'nothing found' : `${count(scan.findings?.length ?? 0, 'finding', 'findings')}`}
          <span className="text-neutral-500">
            {' · '}
            {scan.range} · {count(scan.files ?? 0, 'file', 'files')},{' '}
            {(scan.lines ?? 0).toLocaleString()} added lines · read {formatAgo(scan.at)}
            {scan.allowlisted > 0 ? ` · ${scan.allowlisted} allowlisted` : ''}
          </span>
        </span>
      }
      tone={scan.clean ? 'text-emerald-400' : 'text-rose-400'}
    />
  );
}

export default function Security({ data }) {
  const [allFindings, setAllFindings] = React.useState(false);
  const repositories = repositoriesIn(data);

  if (repositories.length === 0) {
    return (
      <Panel title="Security" icon={ShieldHalf}>
        <Empty>Nothing has been gathered yet. This fills in once the deploy has run.</Empty>
      </Panel>
    );
  }

  const found = findings(repositories);
  const alerts = alertTally(repositories);
  const scanned = repositories.filter((repo) => guardsOf(repo)?.scan?.ran).length;
  const shipped = repositories.filter((repo) => guardsOf(repo)?.prePush?.shipped).length;
  const rules = guardsOf(repositories.find((repo) => guardsOf(repo)?.scanner?.rules?.length))
    ?.scanner?.rules ?? [];

  const families = FAMILIES.map(([name]) => name)
    .concat('Everything else')
    .map((name) => ({
      name,
      rules: rules.filter((rule) => familyOf(rule.rule) === name),
    }))
    .filter((family) => family.rules.length > 0);

  // The deploy's own gates, which are the last thing between a bad commit and
  // the web root. Read off the state each repository is actually in rather than
  // described, because a gate nobody has checked is a gate nobody should trust.
  const gates = repositories.map((repo) => {
    const guards = guardsOf(repo);
    const dirty = listOf(repo, 'dirty');
    return {
      name: repo.name,
      green: repo.green === true,
      ci: repo.ci,
      dirty: dirty.length,
      distCheck: guards?.build?.distCheck === true,
      present: repo.present !== false,
    };
  });
  const ungated = gates.filter((gate) => !gate.distCheck || gate.dirty > 0).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Credentials found"
          value={found.length}
          tone={found.length === 0 ? 'text-emerald-400' : 'text-rose-400'}
          hint={
            scanned === 0
              ? 'nothing scanned yet'
              : `across ${count(scanned, 'repository', 'repositories')} scanned here`
          }
        />
        <Figure
          label="Open alerts"
          value={alerts.open}
          tone={
            alerts.open === 0
              ? 'text-emerald-400'
              : severityTone(alerts.worst) === 'rose'
                ? 'text-rose-400'
                : 'text-amber-300'
          }
          hint={
            alerts.unavailable > 0
              ? `${alerts.unavailable} feed(s) not offered on this plan`
              : alerts.worst
                ? `worst is ${alerts.worst}`
                : 'nothing open'
          }
        />
        <Figure
          label="Pre-push protection"
          value={`${shipped}/${repositories.length}`}
          tone={shipped === repositories.length ? 'text-emerald-400' : 'text-amber-300'}
          hint="repositories carrying the hook"
        />
        <Figure
          label="Deploy gates"
          value={ungated === 0 ? 'all on' : ungated}
          tone={ungated === 0 ? 'text-emerald-400' : 'text-amber-300'}
          hint={ungated === 0 ? 'nothing bypassed' : 'listed below'}
        />
      </div>

      <Panel
        title="Credentials in the code"
        icon={FileSearch}
        action={
          <Pill tone={found.length === 0 ? 'green' : 'rose'}>
            {found.length === 0 ? 'clear' : found.length}
          </Pill>
        }
      >
        {repositories.map((repo) => (
          <ScanRow key={repo.name} repo={repo} />
        ))}

        {found.length > 0 && (
          <div className="border-t border-[#17171d]">
            {(allFindings ? found : found.slice(0, SHOWN)).map((finding) => (
              <div
                key={`${finding.repo}-${finding.file}-${finding.line}-${finding.print}`}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-neutral-500 font-mono">{finding.repo}</span>
                    <Pill tone="rose">{finding.label}</Pill>
                  </div>
                  <p className="text-[13px] text-white font-mono leading-snug break-all mt-1.5">
                    {finding.file}:{finding.line}
                  </p>
                  <p className="text-[11px] text-neutral-600 mt-1 tabular-nums">
                    {finding.length} chars · fingerprint {finding.print}
                  </p>
                </div>
              </div>
            ))}
            {found.length > SHOWN && (
              <button
                type="button"
                onClick={() => setAllFindings((held) => !held)}
                aria-expanded={allFindings}
                className="w-full px-4 sm:px-6 py-3 text-left text-[11px] font-semibold tracking-[0.12em] uppercase text-neutral-500 hover:text-white transition-colors"
              >
                {allFindings ? 'Show less' : `All ${found.length}`}
              </button>
            )}
          </div>
        )}

        <p className="px-4 sm:px-6 py-3 text-[11px] text-neutral-600 leading-relaxed border-t border-[#17171d]">
          {found.length === 0
            ? 'This box read the recent history of each checkout with the repository’s own scanner and found nothing key-shaped. It runs again whenever a tip moves, so it does not depend on anybody having switched the hook on in their clone.'
            : 'The value itself is never recorded — only where it is and a fingerprint of it, because this snapshot is readable by everyone the panel is. Treat anything listed as compromised and rotate it; rewriting the branch does not unpublish a commit that existed.'}
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Pre-push protection"
          icon={ShieldHalf}
          action={
            <Pill tone={shipped === repositories.length ? 'green' : 'amber'}>
              {shipped}/{repositories.length}
            </Pill>
          }
        >
          {repositories.map((repo) => {
            const guards = guardsOf(repo);
            const hook = guards?.prePush;
            return (
              <Row
                key={repo.name}
                label={repo.name}
                value={
                  hook?.shipped
                    ? `hook shipped${hook.executable ? '' : ', not executable'}${
                        guards?.scanner?.shipped ? ' · scanner shipped' : ' · no scanner'
                      }${
                        guards?.scanner?.allowlisted
                          ? ` · ${count(guards.scanner.allowlisted, 'allowlisted value', 'allowlisted values')}`
                          : ''
                      }`
                    : 'no pre-push hook in this repository'
                }
                tone={
                  hook?.shipped && hook.executable && guards?.scanner?.shipped
                    ? 'text-emerald-400'
                    : 'text-amber-300'
                }
              />
            );
          })}
          <p className="px-4 sm:px-6 py-3 text-[11px] text-neutral-600 leading-relaxed border-t border-[#17171d]">
            Whether a hook is shipped is a fact about the repository and is checked here. Whether it
            is switched on is a fact about somebody’s clone and cannot be seen from this box — the
            hook runs where the push happens. Each clone enables it once with{' '}
            <span className="font-mono text-neutral-500">git config core.hooksPath .githooks</span>,
            which is why the scan above is run here as well and not left to it.
          </p>
        </Panel>

        <Panel title="What the scanner looks for" icon={KeyRound}>
          {families.length === 0 ? (
            <Empty>
              No checkout on this box carries the scanner, so there is no list of rules to read off
              it. This stays empty rather than showing a list that might not be what shipped.
            </Empty>
          ) : (
            families.map((family) => (
              <div
                key={family.name}
                className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[13px] text-white">{family.name}</span>
                  <span className="text-[12px] text-neutral-500 tabular-nums">
                    {family.rules.length}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed mt-1">
                  {family.rules.map((rule) => rule.label.replace(/^an? /, '')).join(' · ')}
                </p>
              </div>
            ))
          )}
        </Panel>
      </div>

      <Panel
        title="Alerts from GitHub"
        icon={TriangleAlert}
        action={
          <Pill tone={alerts.open === 0 ? 'green' : severityTone(alerts.worst)}>
            {alerts.open === 0 ? 'clear' : alerts.open}
          </Pill>
        }
      >
        {repositories.map((repo) => {
          const held = alertsOf(repo);
          return (
            <div
              key={repo.name}
              className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0"
            >
              <p className="text-[11px] text-neutral-500 font-mono mb-2">{repo.name}</p>
              <div className="space-y-2">
                {FEEDS.map(([feed, name]) => {
                  const one = held[feed];
                  if (!one) {
                    return (
                      <p key={feed} className="text-[12px] text-neutral-600">
                        {name} — not asked for yet
                      </p>
                    );
                  }
                  if (one.available === false) {
                    return (
                      <p key={feed} className="text-[12px] text-neutral-500">
                        {name} — <span className="text-neutral-600">{one.why}</span>
                      </p>
                    );
                  }
                  if ((one.open ?? 0) === 0) {
                    return (
                      <p key={feed} className="text-[12px] text-emerald-400/80">
                        {name} — nothing open
                      </p>
                    );
                  }
                  return (
                    <div key={feed} className="space-y-1.5">
                      <p className="text-[12px] text-white">
                        {name} — {count(one.open, 'open alert', 'open alerts')}
                      </p>
                      {(one.items ?? [])
                        .slice()
                        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
                        .slice(0, SHOWN)
                        .map((item) => (
                          <div
                            key={`${feed}-${item.number}`}
                            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 pl-3 border-l border-[#282832]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Pill tone={severityTone(item.severity)}>
                                  {item.severity ?? 'unrated'}
                                </Pill>
                                {item.subject && (
                                  <span className="text-[11px] text-neutral-500 font-mono truncate">
                                    {item.subject}
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-neutral-300 leading-snug break-words mt-1">
                                {item.title ?? 'no summary given'}
                              </p>
                            </div>
                            <GithubLink href={item.url} title="Open this alert on GitHub" />
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <p className="px-4 sm:px-6 py-3 text-[11px] text-neutral-600 leading-relaxed">
          A feed that is not offered says so rather than showing nothing. The two read identically
          as a zero and mean opposite things — secret scanning and code scanning are paid features
          on private repositories, so an empty count there is not a clean bill of health, and this
          section refuses to draw it as one.
        </p>
      </Panel>

      <Panel
        title="What the deploy will refuse"
        icon={Rocket}
        action={<Pill tone={ungated === 0 ? 'green' : 'amber'}>{ungated === 0 ? 'all on' : ungated}</Pill>}
      >
        {gates.map((gate) => (
          <Row
            key={gate.name}
            label={gate.name}
            value={
              !gate.present
                ? 'no checkout, so nothing can deploy'
                : [
                    gate.green ? 'CI green' : `CI ${gate.ci ?? 'unknown'} — deploy holds`,
                    gate.dirty > 0
                      ? `${count(gate.dirty, 'file', 'files')} modified in the checkout`
                      : 'checkout clean',
                    gate.distCheck ? 'dist checked before serving' : 'no dist check in this repo',
                  ].join(' · ')
            }
            tone={
              !gate.present || gate.dirty > 0
                ? 'text-rose-400'
                : gate.green && gate.distCheck
                  ? 'text-emerald-400'
                  : 'text-amber-300'
            }
          />
        ))}
        <p className="px-4 sm:px-6 py-3 text-[11px] text-neutral-600 leading-relaxed border-t border-[#17171d]">
          Nothing reaches the web root off a commit whose checks did not pass, and the build refuses
          itself if anything credential-shaped or backup-shaped ends up in dist. A dirty checkout is
          listed in red because it stops the fast-forward silently: deploys simply stop happening,
          and the panel is the only place that says so.
        </p>
      </Panel>
    </div>
  );
}
