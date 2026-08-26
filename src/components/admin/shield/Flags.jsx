import React from 'react';
import {
  Flag,
  RefreshCw,
  Trash2,
  Radio,
  Archive,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  SEVERITY_TEXT,
  countBy,
  countBySeverity,
  flagKey,
  formatAgo,
  formatCount,
  groupFlags,
  hourlyFlags,
  normaliseReference,
  severityOrder,
} from '../../../lib/admin';
import { Button, Check, Empty, Figure, Panel, Pill, RankedBar, Select, Sparkline, TextInput } from '../ui';
import { Confirm } from '../api/shared';
import { FlagRow, SeverityPill, Unreachable } from './shared';

const SOURCES = [
  { id: 'history', label: 'Kept on disk' },
  { id: 'live', label: 'Since the last restart' },
];

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

function Group({ group, verbose, expanded, onToggle }) {
  const many = group.flags.length > 1;
  return (
    <div className="border-b border-[#17171d] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left px-4 sm:px-6 py-4 hover:bg-[#0e0e12] transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <SeverityPill severity={group.severity} />
              {group.blocked ? <Pill tone="rose">refused</Pill> : <Pill>recorded</Pill>}
              {many ? <Pill tone="purple">{group.flags.length} rules</Pill> : null}
              <span className="text-[13px] text-white font-mono">
                {group.flags.map((flag) => flag.id).join(', ')}
              </span>
            </div>
            <p className="text-[12px] text-neutral-500 font-mono truncate">
              {group.method ?? '—'} {group.path ?? '—'}
              {group.ip ? ` · ${group.ip}` : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {group.reference ? (
              <span className="text-[11px] text-purple-300/80 font-mono">{group.reference}</span>
            ) : null}
            <span className="text-[12px] text-neutral-600 font-normal tabular-nums">
              {formatAgo(group.time)}
            </span>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-[#17171d] bg-[#08080b]">
          {group.flags.map((flag, index) => (
            <FlagRow key={flagKey(flag, index)} flag={flag} verbose={verbose} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Flags({ shield, loading, verbose, onVerbose, canManage, onRefresh, onClear }) {
  const [source, setSource] = React.useState('history');
  const [severity, setSeverity] = React.useState('all');
  const [rule, setRule] = React.useState('all');
  const [lookup, setLookup] = React.useState('');
  const [open, setOpen] = React.useState(() => new Set());

  const history = shield?.history ?? [];
  const live = shield?.state?.live ?? [];
  const pool = source === 'live' ? live : history;

  const reference = normaliseReference(lookup);
  const searching = lookup.trim().length > 0;

  const counts = countBySeverity(pool);
  const worst = counts.critical + counts.high;

  const ruleIds = React.useMemo(() => {
    const seen = new Set();
    for (const flag of pool) if (flag?.id) seen.add(flag.id);
    return [...seen].sort();
  }, [pool]);

  const trend = React.useMemo(() => hourlyFlags(pool), [pool]);
  const topRules = React.useMemo(() => countBy(pool, (flag) => flag.id).slice(0, 6), [pool]);
  const topPaths = React.useMemo(
    () => countBy(pool, (flag) => `${flag.method ?? ''} ${flag.path ?? ''}`.trim()).slice(0, 6),
    [pool],
  );
  const topCallers = React.useMemo(() => countBy(pool, (flag) => flag.ip).slice(0, 6), [pool]);

  const groups = React.useMemo(() => {
    if (reference) {
      return groupFlags(pool.filter((flag) => flag.reference === reference));
    }
    const filtered = pool.filter(
      (flag) =>
        (severity === 'all' || flag?.severity === severity) &&
        (rule === 'all' || flag?.id === rule),
    );
    return groupFlags([...filtered].sort(severityOrder));
  }, [pool, severity, rule, reference]);

  React.useEffect(() => {
    if (reference) setOpen(new Set(groups.map((group) => group.key)));
  }, [reference, groups]);

  function toggle(key) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const sourceNote =
    source === 'live'
      ? 'Held in the evaluator’s memory, newest first. The last 500 since it started, and gone when it restarts.'
      : shield?.historySource === 'file'
        ? 'Read straight off the flag file, because the evaluator is not answering.'
        : 'Written to a file as they are raised, so they survive a restart of the service.';

  const shownFlags = groups.reduce((sum, group) => sum + group.flags.length, 0);

  return (
    <div className="w-full flex flex-col gap-6">
      <Unreachable shield={shield} />

      <Panel title="Look up a reference" icon={Search}>
        <div className="px-4 sm:px-6 py-5">
          <p className="text-[13px] text-neutral-400 font-normal leading-relaxed mb-4 max-w-2xl">
            Someone who was refused gets a code like{' '}
            <span className="font-mono text-neutral-300">AMS-4A98-3BEF</span> on the block page.
            Paste it here — or the whole blocked URL — to see exactly what their request tripped.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <TextInput
                value={lookup}
                spellCheck="false"
                autoCapitalize="characters"
                autoCorrect="off"
                aria-label="Reference code"
                placeholder="AMS-XXXX-XXXX"
                className="font-mono pr-10"
                onChange={(event) => setLookup(event.target.value)}
              />
              {searching ? (
                <button
                  type="button"
                  onClick={() => setLookup('')}
                  aria-label="Clear the lookup"
                  className="absolute right-0 top-0 h-full px-3 text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              ) : null}
            </div>
            {searching ? (
              reference ? (
                <Pill tone={groups.length ? 'green' : 'amber'}>
                  {groups.length ? 'found' : 'no flag under that code'}
                </Pill>
              ) : (
                <Pill tone="rose">not a reference code</Pill>
              )
            ) : null}
          </div>
          {searching && !reference ? (
            <p className="text-[12px] text-neutral-500 font-normal mt-3">
              A reference is AMS- followed by two groups of four, using 0–9 and A–F.
            </p>
          ) : null}
          {reference && groups.length === 0 ? (
            <p className="text-[12px] text-neutral-500 font-normal mt-3">
              Nothing under {reference} in {source === 'live' ? 'memory' : 'the flag file'}. It may
              have aged out, been cleared, or been raised on a different source — try the other one.
            </p>
          ) : null}
        </div>
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Figure
          label="Flags held"
          value={formatCount(pool.length)}
          hint={source === 'live' ? 'since the last restart' : 'kept on disk'}
        />
        <Figure
          label="Requests"
          value={formatCount(groupFlags(pool).length)}
          hint="one code each"
        />
        <Figure
          label="Critical & high"
          value={formatCount(worst)}
          tone={worst > 0 ? 'text-rose-400' : 'text-white'}
        />
        <Figure
          label="Refused"
          value={formatCount(pool.filter((flag) => flag.blocked).length)}
          hint={shield?.state?.mode === 'block' ? 'block mode is on' : 'monitor mode — nothing refused'}
          tone={pool.some((flag) => flag.blocked) ? 'text-amber-300' : 'text-white'}
        />
      </div>

      {pool.length > 0 && (
        <Panel title="Last 24 hours" icon={TrendingUp}>
          <div className="px-4 sm:px-6 py-5">
            <Sparkline points={trend.points} labels={trend.labels} unit="flags" height={56} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 border-t border-[#17171d]">
            {[
              ['Rules', topRules],
              ['Paths', topPaths],
              ['Callers', topCallers],
            ].map(([title, rows], column) => (
              <div
                key={title}
                className={column < 2 ? 'md:border-r border-[#17171d]' : undefined}
              >
                <p className="px-4 sm:px-6 pt-4 pb-2 text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase">
                  {title}
                </p>
                {rows.length === 0 ? (
                  <Empty>Nothing recorded.</Empty>
                ) : (
                  rows.map((row) => (
                    <RankedBar
                      key={row.name}
                      name={row.name}
                      value={formatCount(row.count)}
                      percent={(row.count / rows[0].count) * 100}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel
        title={reference ? `Reference ${reference}` : `Requests — ${groups.length}`}
        icon={Flag}
        action={
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <Button type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              {loading ? 'Reading…' : 'Refresh'}
            </Button>
            {canManage && (
              <Confirm label="Clear" danger icon={Trash2} onConfirm={onClear}>
                Yes, clear every flag
              </Confirm>
            )}
          </div>
        }
      >
        {!reference && (
          <div className="px-4 sm:px-6 py-4 border-b border-[#17171d] flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                value={source}
                aria-label="Where the flags come from"
                onChange={(event) => setSource(event.target.value)}
              >
                {SOURCES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </Select>

              <Select
                value={severity}
                aria-label="Filter by severity"
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="all">Every severity</option>
                {SEVERITIES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </Select>

              <Select
                value={rule}
                aria-label="Filter by rule"
                onChange={(event) => setRule(event.target.value)}
              >
                <option value="all">Every rule</option>
                {ruleIds.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-start justify-between gap-6 flex-wrap">
              <p className="text-[12px] text-neutral-500 font-normal leading-relaxed max-w-xl flex items-start gap-2">
                {source === 'live' ? (
                  <Radio className="h-3.5 w-3.5 shrink-0 mt-[2px]" strokeWidth={1.5} />
                ) : (
                  <Archive className="h-3.5 w-3.5 shrink-0 mt-[2px]" strokeWidth={1.5} />
                )}
                <span>
                  {sourceNote} Showing {formatCount(shownFlags)} flag
                  {shownFlags === 1 ? '' : 's'} across {groups.length} request
                  {groups.length === 1 ? '' : 's'}.
                </span>
              </p>
              <div className="min-w-0 sm:shrink-0">
                <Check
                  checked={verbose}
                  onChange={onVerbose}
                  label="Dev mode"
                  hint="show each flag exactly as the package recorded it"
                />
              </div>
            </div>
          </div>
        )}

        {pool.length === 0 && (
          <Empty>
            {loading
              ? 'Reading the flags…'
              : source === 'live'
                ? 'Nothing has been flagged since the evaluator started.'
                : 'Nothing has been flagged yet.'}
          </Empty>
        )}

        {pool.length > 0 && groups.length === 0 && (
          <Empty>{reference ? 'No flag carries that code.' : 'Nothing matches that filter.'}</Empty>
        )}

        {groups.map((group) => (
          <Group
            key={group.key}
            group={group}
            verbose={verbose}
            expanded={open.has(group.key)}
            onToggle={() => toggle(group.key)}
          />
        ))}
      </Panel>

      <Panel title="How to read these" icon={Flag}>
        <div className="px-4 sm:px-6 py-5 text-[13px] text-neutral-400 font-normal leading-relaxed">
          <p className="mb-3">
            One row is one request, not one rule. A request that trips three rules shows once, under
            a single reference code — open it to see all three.{' '}
            <span className={SEVERITY_TEXT.critical}>Critical</span> and{' '}
            <span className={SEVERITY_TEXT.high}>high</span> are what block mode refuses; medium and
            low are recorded whatever the mode.
          </p>
          <p className="mb-3">
            The code is what a refused caller quotes, which makes the lookup above the fastest route
            from &ldquo;your site blocked me&rdquo; to knowing whether it was right to.
          </p>
          <p>
            A rule set to record only still appears here and never refuses — the Detect tab is where
            that is set.
          </p>
        </div>
      </Panel>
    </div>
  );
}
