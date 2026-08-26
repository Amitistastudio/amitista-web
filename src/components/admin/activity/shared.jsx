import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { WEEKDAYS, formatCount, shareOf } from '../../../lib/admin';
import { Bar, Empty } from '../ui';

export function Delta({ value, invert = false, suffix = 'on the window before' }) {
  if (value === null || value === undefined) {
    return <span className="text-[12px] text-neutral-600 font-normal">no earlier window to compare</span>;
  }
  const flat = value === 0;
  const good = invert ? value < 0 : value > 0;
  const Icon = flat ? Minus : value > 0 ? TrendingUp : TrendingDown;
  const tone = flat ? 'text-neutral-500' : good ? 'text-emerald-400' : 'text-amber-300';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-normal ${tone}`}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      <span className="tabular-nums">
        {value > 0 ? '+' : ''}
        {value}%
      </span>
      <span className="text-neutral-600">{suffix}</span>
    </span>
  );
}

export function Ranked({ rows, empty, unit = '', tone = 'bg-purple-500/70', label, detail }) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return <Empty>{empty}</Empty>;
  const peak = Math.max(1, ...list.map((row) => row.count ?? 0));
  const total = list.reduce((sum, row) => sum + (row.count ?? 0), 0);

  return (
    <div className="px-4 sm:px-6 py-5 flex flex-col gap-3.5">
      {list.map((row, index) => (
        <div key={`${row.name ?? row.path ?? index}-${index}`}>
          <div className="flex items-baseline justify-between gap-4 mb-1.5">
            <span className="text-[13px] text-white font-normal truncate min-w-0">
              {label ? label(row) : row.name}
            </span>
            <span className="text-[12px] text-neutral-400 tabular-nums shrink-0">
              {formatCount(row.count)}
              {unit ? ` ${unit}` : ''}
              {total > 0 && (
                <span className="text-neutral-600"> · {Math.round((row.count / total) * 100)}%</span>
              )}
            </span>
          </div>
          <Bar percent={shareOf(row.count, peak)} tone={tone} />
          {detail && detail(row) ? (
            <p className="text-[11px] text-neutral-600 font-mono mt-1.5 truncate">{detail(row)}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function Split({ rows, total, empty }) {
  const list = (rows ?? []).filter((row) => (row.count ?? 0) > 0);
  if (list.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex h-2.5 w-full overflow-hidden bg-[#1c1c22] mb-5">
        {list.map((row) => (
          <span
            key={row.id ?? row.name}
            className={row.tone}
            style={{ width: `${shareOf(row.count, total)}%` }}
            title={`${row.name}: ${formatCount(row.count)}`}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        {list.map((row) => (
          <div key={row.id ?? row.name} className="flex items-baseline justify-between gap-4">
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <span className={`h-2 w-2 shrink-0 ${row.tone}`} />
              <span className="text-[13px] text-white font-normal truncate">{row.name}</span>
            </span>
            <span className="text-[12px] text-neutral-400 tabular-nums shrink-0">
              {formatCount(row.count)}
              <span className="text-neutral-600"> · {Math.round(shareOf(row.count, total))}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const HEAT_STEPS = [
  'bg-[#15151b]',
  'bg-purple-500/20',
  'bg-purple-500/40',
  'bg-purple-500/60',
  'bg-purple-500/80',
  'bg-purple-400',
];

export function Heat({ grid, days = 7 }) {
  const rows = Array.isArray(grid) && grid.length === 7 ? grid : null;
  if (!rows) return <Empty>Nothing has been recorded yet.</Empty>;
  const peak = Math.max(1, ...rows.flat());
  const total = rows.flat().reduce((sum, value) => sum + value, 0);

  if (total === 0) {
    return <Empty>No page was opened in the last {days} days.</Empty>;
  }

  return (
    <div className="px-4 sm:px-6 py-5 overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="flex gap-[3px] mb-1.5 pl-[38px]">
          {Array.from({ length: 24 }, (unused, hour) => (
            <span
              key={hour}
              className="flex-1 text-center text-[9px] text-neutral-600 tabular-nums"
            >
              {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
            </span>
          ))}
        </div>
        {rows.map((row, day) => (
          <div key={WEEKDAYS[day]} className="flex items-center gap-[3px] mb-[3px]">
            <span className="w-[35px] shrink-0 text-[10px] text-neutral-500 tracking-wide">
              {WEEKDAYS[day]}
            </span>
            {row.map((value, hour) => {
              const step = value === 0 ? 0 : Math.max(1, Math.ceil((value / peak) * (HEAT_STEPS.length - 1)));
              return (
                <span
                  key={hour}
                  className={`flex-1 h-4 rounded-[2px] ${HEAT_STEPS[step]}`}
                  title={`${WEEKDAYS[day]} ${String(hour).padStart(2, '0')}:00 UTC — ${formatCount(value)} page${value === 1 ? '' : 's'}`}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-neutral-600 tracking-wider uppercase">
            hour of day, UTC
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-600 tracking-wider uppercase">quiet</span>
            {HEAT_STEPS.map((tone) => (
              <span key={tone} className={`h-2.5 w-2.5 rounded-[2px] ${tone}`} />
            ))}
            <span className="text-[10px] text-neutral-600 tracking-wider uppercase">busy</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function Note({ children }) {
  return (
    <div className="px-4 sm:px-6 py-4 border-t border-[#17171d]">
      <p className="text-[12px] text-neutral-500 font-normal leading-relaxed">{children}</p>
    </div>
  );
}
