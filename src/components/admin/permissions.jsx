import React from 'react';
import { ChevronRight } from 'lucide-react';
import {
  PERMISSION_LABELS,
  PERMISSION_LEVELS,
  PERMISSION_LEVEL_ORDER,
  PERMISSION_NEEDS,
  describeAccess,
  groupPermissions,
  permissionArea,
  permissionIncludes,
  permissionLevel,
  permissionNeeds,
  permissionShort,
} from '../../lib/admin';

const TONES = {
  see: {
    on: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
  },
  own: {
    on: 'border-purple-500/40 bg-purple-500/10 text-purple-200',
    dot: 'bg-purple-400',
    text: 'text-purple-300',
  },
  change: {
    on: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
  },
};

const OFF = 'border-[#282832] text-neutral-500';

function join(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function levelTone(level) {
  return TONES[level] ?? TONES.see;
}

export function LevelKey({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {PERMISSION_LEVEL_ORDER.map((level) => (
        <span key={level} className="inline-flex items-baseline gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] ${levelTone(level).dot}`} />
          <span className="text-[11px] font-semibold text-neutral-300">
            {PERMISSION_LEVELS[level].label}
          </span>
          <span className="text-[11px] font-normal text-neutral-600">
            {PERMISSION_LEVELS[level].blurb}
          </span>
        </span>
      ))}
    </div>
  );
}

export function LevelPill({ level }) {
  const tone = levelTone(level);
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.on}`}
    >
      <span className={`h-1 w-1 shrink-0 ${tone.dot}`} />
      {PERMISSION_LEVELS[level]?.label ?? level}
    </span>
  );
}

export function LevelTally({ held, className = '' }) {
  const granted = Array.isArray(held) ? held : [];
  const counted = PERMISSION_LEVEL_ORDER.map((level) => ({
    level,
    count: granted.filter((permission) => permissionLevel(permission) === level).length,
  })).filter((entry) => entry.count > 0);

  if (counted.length === 0) {
    return <span className={`text-[12px] font-normal text-neutral-600 ${className}`}>nothing yet</span>;
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 ${className}`}>
      {counted.map((entry) => (
        <span key={entry.level} className="inline-flex items-baseline gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] ${levelTone(entry.level).dot}`} />
          <span className="text-[12px] font-normal text-neutral-400">
            {PERMISSION_LEVELS[entry.level].label}
            <span className="text-neutral-500 tabular-nums"> {entry.count}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

function covers(group, granted) {
  return group.permissions
    .filter((permission) => granted.includes(permission))
    .map((permission) => {
      const under = permissionIncludes(permission).filter((entry) =>
        group.permissions.includes(entry),
      );
      if (under.length === 0) return null;
      return `${permissionShort(permission)} already covers ${join(under.map(permissionShort))}.`;
    })
    .filter(Boolean);
}

function Chip({ permission, on, editable, onToggle }) {
  const level = permissionLevel(permission);
  const tone = levelTone(level);
  const label = permissionShort(permission);
  const title = `${PERMISSION_LABELS[permission] ?? permission} · ${permission}`;
  const shape =
    'inline-flex items-center gap-1.5 border px-2.5 py-[5px] text-[12px] font-normal transition-colors';

  if (!editable) {
    return (
      <span title={title} className={`${shape} ${on ? tone.on : `${OFF} opacity-60`}`}>
        <span className={`h-1.5 w-1.5 shrink-0 ${on ? tone.dot : 'bg-neutral-700'}`} />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={() => onToggle(permission, !on)}
      className={`${shape} ${on ? tone.on : `${OFF} hover:border-[#3a3a46] hover:text-neutral-300`}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 ${on ? tone.dot : 'bg-neutral-700'}`} />
      {label}
    </button>
  );
}

export function PermissionDetail({ permissions, effective }) {
  const groups = groupPermissions(permissions);
  const held = Array.isArray(effective) ? effective : null;

  return (
    <div className="divide-y divide-[#17171d] border-t border-[#17171d]">
      {groups.map((group) => (
        <div key={group.id} className="py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
            {group.label}
          </p>
          <div className="space-y-1.5">
            {group.permissions.map((permission) => {
              const on = held === null || held.includes(permission);
              return (
                <div
                  key={permission}
                  className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${on ? '' : 'opacity-50'}`}
                >
                  <LevelPill level={permissionLevel(permission)} />
                  <span className="text-[13px] font-normal text-neutral-300">
                    {PERMISSION_LABELS[permission] ?? permission}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-neutral-600">{permission}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PermissionPicker({ permissions, effective, editable, onToggle }) {
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState(null);
  const all = groupPermissions(permissions);
  const granted = Array.isArray(effective) ? effective : [];
  const holds = (group) => group.permissions.some((permission) => granted.includes(permission));
  const groups = editable ? all : all.filter(holds);
  const empty = editable ? [] : all.filter((group) => !holds(group));

  function toggle(permission, on) {
    onToggle(permission, on);
    if (on) {
      const added = permissionNeeds(permission).filter((need) => !granted.includes(need));
      added.forEach((need) => onToggle(need, true));
      setNote(
        added.length
          ? `${permissionShort(permission)} cannot open the ${permissionArea(permission)} screen on its own, so ${join(
              added.map((need) => permissionShort(need)),
            )} went on with it.`
          : null,
      );
      return;
    }
    const dropped = Object.keys(PERMISSION_NEEDS).filter(
      (dependent) =>
        PERMISSION_NEEDS[dependent].includes(permission) && granted.includes(dependent),
    );
    dropped.forEach((dependent) => onToggle(dependent, false));
    setNote(
      dropped.length
        ? `${join(dropped.map((dependent) => permissionShort(dependent)))} went off too — it has no screen to open without ${permissionShort(permission)}.`
        : null,
    );
  }

  if (!editable && groups.length === 0) {
    return <p className="text-[13px] font-normal text-neutral-500">Nothing at all — no access yet.</p>;
  }

  return (
    <div>
      <p className="pb-3 text-[13px] font-normal leading-relaxed text-neutral-300">
        {describeAccess(granted, permissions.length)}
      </p>
      <LevelKey className="pb-3" />

      <div className="divide-y divide-[#17171d] border-y border-[#17171d]">
        {groups.map((group) => {
          const all = group.permissions.every((permission) => granted.includes(permission));
          return (
            <div
              key={group.id}
              className="grid gap-x-4 gap-y-2 py-2.5 sm:grid-cols-[148px_minmax(0,1fr)] sm:items-baseline"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-semibold text-neutral-300">{group.label}</span>
                {editable && group.permissions.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      group.permissions.forEach((permission) => {
                        if (granted.includes(permission) === all) onToggle(permission, !all);
                      })
                    }
                    className="text-[11px] font-normal text-neutral-600 underline decoration-dotted underline-offset-2 hover:text-neutral-300"
                  >
                    {all ? 'clear' : 'tick all'}
                  </button>
                )}
              </div>
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {group.permissions.map((permission) => (
                    <Chip
                      key={permission}
                      permission={permission}
                      on={granted.includes(permission)}
                      editable={editable}
                      onToggle={toggle}
                    />
                  ))}
                </div>
                {covers(group, granted).map((line) => (
                  <p key={line} className="mt-1.5 text-[11px] font-normal text-neutral-600">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {note && (
        <p className="pt-2.5 text-[12px] font-normal leading-relaxed text-amber-300/80">{note}</p>
      )}

      {empty.length > 0 && (
        <p className="pt-2.5 text-[12px] font-normal leading-relaxed text-neutral-600">
          Nothing in {empty.map((group) => group.label).join(', ')}.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((held) => !held)}
        aria-expanded={open}
        className="mt-1 flex w-full items-center justify-between gap-4 py-2 text-left"
      >
        <span className="text-[12px] font-semibold tracking-wide text-neutral-500 hover:text-neutral-300">
          {open ? 'Hide what each one does' : 'What each one does'}
        </span>
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-neutral-600 transition-transform ${open ? 'rotate-90' : ''}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <PermissionDetail
          permissions={editable ? permissions : permissions.filter((permission) => granted.includes(permission))}
          effective={effective}
        />
      )}
    </div>
  );
}
