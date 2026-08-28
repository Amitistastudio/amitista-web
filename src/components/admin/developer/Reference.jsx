import React from 'react';
import {
  BookMarked,
  Check as CheckIcon,
  Copy,
  Database,
  FolderGit2,
  ScrollText,
  Server,
  Terminal,
} from 'lucide-react';
import { formatAgo, formatBytes } from '../../../lib/admin';
import { Empty, Notice, Panel } from '../ui';

// Section titles come from the collector, so each one is matched to an icon by
// name here and falls back to the book if a section is ever added there without
// one being picked here.
const SECTION_ICON = {
  'Where the code lives': FolderGit2,
  'Where it runs': Server,
  'Configuration & data': Database,
  Logs: ScrollText,
  'Everyday commands': Terminal,
};

// Only a row with something wrong is marked. A row that resolved says so by
// carrying its facts — a green dot on all twenty would be twenty things asking
// to be looked at instead of none.
const STATE_MARK = {
  missing: 'bg-rose-500',
  drifted: 'bg-amber-400',
};

const STATE_TEXT = {
  missing: 'text-rose-400',
  drifted: 'text-amber-300',
  unchecked: 'text-neutral-700',
};

function factsOf(row) {
  if (row.state === 'unchecked') return 'not checked';

  const parts = [];
  if (row.detail) parts.push(row.detail);
  if (Number.isFinite(row.bytes)) parts.push(formatBytes(row.bytes));
  if (row.changed) parts.push(formatAgo(row.changed));
  return parts.join(' · ');
}

// The unit is named on every row that has one — knowing what a thing is called
// is half of why this screen exists — but it only takes a colour when it is not
// running, and only then does it spell out what it is doing instead.
function unitOf(row) {
  const unit = row.unit;
  if (!unit || typeof unit.name !== 'string') return null;

  const running = unit.state === 'active';
  const many = !(unit.name.endsWith('.service') || unit.name.endsWith('.timer'));
  return {
    text: many ? unit.detail : unit.name + (running ? '' : ` · ${unit.detail}`),
    tone: running ? 'text-neutral-600' : unit.state === 'failed' ? 'text-rose-400' : 'text-amber-300',
  };
}

// A path has no spaces in it, so a narrow column breaks it wherever the
// character happens to land — /opt/amitista/admin-api/admin_api.p / y. Marking
// each separator as the place to break puts the wrap between path segments
// instead. <wbr> is zero-width and copies as nothing, and the copy button reads
// the untouched string anyway.
function Breakable({ value }) {
  const parts = value.split('/');
  return parts.map((part, index) => (
    <React.Fragment key={index}>
      {index > 0 && '/'}
      {index > 0 && <wbr />}
      {part}
    </React.Fragment>
  ));
}

function ReferenceRow({ row }) {
  const [copied, setCopied] = React.useState(false);
  const value = row.value;

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [value]);

  const facts = factsOf(row);
  const unit = unitOf(row);
  const mark = STATE_MARK[row.state];

  return (
    <div className="group grid gap-x-6 gap-y-1 sm:grid-cols-[210px_minmax(0,1fr)] px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
      <div className="min-w-0">
        <span className="block text-[12.5px] text-neutral-300 font-normal">{row.label}</span>
        {row.hint && (
          <span className="block text-[11px] text-neutral-500 font-normal leading-snug mt-0.5">
            {row.hint}
          </span>
        )}
      </div>

      <div className="min-w-0 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span
            className={`block text-[12.5px] font-mono break-words ${
              row.state === 'missing' ? 'text-rose-300 line-through decoration-rose-500/40' : 'text-white'
            }`}
          >
            <Breakable value={row.value} />
          </span>

          {(facts || unit) && (
            <span className="flex flex-wrap items-center gap-x-2 mt-1 text-[11px]">
              {mark && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${mark}`} />}
              {facts && (
                <span className={`tabular-nums ${STATE_TEXT[row.state] ?? 'text-neutral-500'}`}>
                  {facts}
                </span>
              )}
              {facts && unit && <span className="text-neutral-800">·</span>}
              {unit && <span className={`font-mono ${unit.tone}`}>{unit.text}</span>}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${row.label}`}
          className="tap shrink-0 inline-flex items-center gap-1.5 border border-[#282832] px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-neutral-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:text-neutral-200 hover:bg-[#111115] transition-all"
        >
          {copied ? (
            <CheckIcon className="h-3 w-3" strokeWidth={2} />
          ) : (
            <Copy className="h-3 w-3" strokeWidth={2} />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function Reference({ data }) {
  const sections = Array.isArray(data.reference) ? data.reference : [];
  const rows = sections.flatMap((section) => section.rows ?? []);
  const problems = rows.filter((row) => row.state === 'missing' || row.state === 'drifted');
  const hidden = rows.filter((row) => row.state === 'unchecked');
  const resolved = rows.filter((row) => row.state === 'ok').length;

  if (sections.length === 0) {
    return (
      <Panel title="Reference" icon={BookMarked}>
        <Empty>
          The collector has not written the reference yet. It lands on the next snapshot — or run
          systemctl start amitista-admin-snapshot.service to have it now.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-[13px] text-neutral-500 font-normal leading-relaxed text-pretty max-w-2xl">
          Where everything on this box lives, what each unit is called, and the commands worth not
          looking up. Hover a row to copy it.
        </p>
        <p className="text-[11px] text-neutral-600 tabular-nums">
          {resolved} resolved against the box when the snapshot ran
          {hidden.length > 0 ? ` · ${hidden.length} not checked` : ''}
        </p>
      </div>

      {problems.length > 0 && (
        <Notice tone={problems.some((row) => row.state === 'missing') ? 'rose' : 'amber'}>
          <span className="block font-semibold mb-1.5">
            {problems.length} row{problems.length === 1 ? '' : 's'} to look at
          </span>
          <ul className="space-y-1">
            {problems.map((row) => (
              <li key={row.label} className="text-[12.5px]">
                {row.label} — {row.detail || 'no longer resolves'}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {sections.map((section) => (
        <Panel
          key={section.title}
          title={section.title}
          icon={SECTION_ICON[section.title] ?? BookMarked}
        >
          {(section.rows ?? []).map((row) => (
            <ReferenceRow key={row.label} row={row} />
          ))}
        </Panel>
      ))}

      {hidden.length > 0 && (
        <p className="text-[11px] text-neutral-600 font-normal leading-relaxed max-w-2xl">
          {hidden.length} rows are listed but not checked: the collector runs sandboxed with
          ProtectHome, so /root is not inside its namespace. Every other row on this page was
          resolved against the box.
        </p>
      )}
    </div>
  );
}
