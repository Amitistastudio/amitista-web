import React from 'react';
import { AlertTriangle, Search } from 'lucide-react';

const STATE_DOT = {
  active: 'bg-emerald-400',
  inactive: 'bg-neutral-600',
  failed: 'bg-rose-500',
  activating: 'bg-amber-400',
  unknown: 'bg-neutral-600',
};

export function Dot({ state }) {
  return <span className={`h-2 w-2 rounded-full shrink-0 ${STATE_DOT[state] ?? STATE_DOT.unknown}`} />;
}

export const FIELD_CLASS =
  'w-full bg-[#111115] border border-[#282832] px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-purple-500/60 transition-colors';

export function Figure({ label, value, tone = 'text-white', hint }) {
  return (
    <div className="border border-[#282832] bg-[#0a0a0d] px-4 py-4 sm:px-5">
      <p className="text-[11px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
        {label}
      </p>
      <p className={`text-2xl font-normal tabular-nums leading-none ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-neutral-600 font-normal mt-2">{hint}</p>}
    </div>
  );
}

export function Bar({ percent, tone = 'bg-purple-500/70' }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-1.5 w-full bg-[#1c1c22]">
      <div className={`h-full rounded-r-[4px] ${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Hero({ value, label, footnote }) {
  return (
    <div className="flex flex-col">
      <span className="text-[36px] sm:text-[44px] font-semibold text-white leading-none tracking-tight">
        {value}
      </span>
      <span className="text-[13px] text-neutral-400 font-normal mt-2">{label}</span>
      {footnote && <span className="text-[12px] text-neutral-600 font-normal mt-1">{footnote}</span>}
    </div>
  );
}

export function RankedBar({ name, detail, value, percent, tone }) {
  return (
    <div className="px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
      <div className="flex items-baseline justify-between gap-4 sm:gap-6 mb-2">
        <span className="text-[13px] text-white font-normal truncate">{name}</span>
        <span className="text-[13px] text-neutral-300 font-medium tabular-nums shrink-0">{value}</span>
      </div>
      <Bar percent={percent} tone={tone} />
      {detail && <p className="text-[11px] text-neutral-600 font-mono mt-1.5 truncate">{detail}</p>}
    </div>
  );
}

export function Panel({ title, icon: Icon, children, action, className = '' }) {
  return (
    <section className={`border border-[#282832] bg-[#0a0a0d] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-4 border-b border-[#282832]">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && <Icon className="h-4 w-4 text-neutral-500 shrink-0" strokeWidth={1.5} />}
          <h2 className="text-[11px] font-semibold text-neutral-300 tracking-[0.18em] uppercase truncate">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, tone = 'text-white' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:gap-6 px-4 sm:px-6 py-3 border-b border-[#17171d] last:border-b-0">
      <span className="text-[13px] text-neutral-400 font-normal">{label}</span>
      <span className={`text-[13px] font-medium tabular-nums text-right ${tone}`}>{value}</span>
    </div>
  );
}

export function UsageBar({ percent }) {
  const filled = Math.max(0, Math.min(24, Math.round((percent / 100) * 24)));
  return (
    <div className="flex items-center gap-[3px] h-3 w-full" role="img" aria-label={`${percent}% used`}>
      {Array.from({ length: 24 }, (unused, index) => (
        <span
          key={index}
          className={`flex-1 h-full rounded-[1px] ${
            index < filled
              ? percent > 90
                ? 'bg-rose-500'
                : percent > 75
                  ? 'bg-amber-400'
                  : 'bg-emerald-500/80'
              : 'bg-[#1c1c22]'
          }`}
        />
      ))}
    </div>
  );
}

export function Notice({ tone = 'amber', icon: Icon = AlertTriangle, children }) {
  const tones = {
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200/80',
    rose: 'border-rose-500/40 bg-rose-500/10 text-rose-200/80',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200/80',
  };
  return (
    <div className={`border px-4 sm:px-6 py-4 flex gap-3 ${tones[tone] ?? tones.amber}`}>
      <Icon className="h-4 w-4 shrink-0 mt-[2px]" strokeWidth={1.5} />
      <div className="text-[13px] font-normal leading-relaxed">{children}</div>
    </div>
  );
}

export function Button({ children, tone = 'quiet', className = '', ...rest }) {
  const tones = {
    quiet:
      'border border-[#282832] bg-[#0a0a0d] text-neutral-300 hover:bg-[#111115] disabled:opacity-40',
    solid: 'bg-white text-black hover:bg-neutral-200 disabled:opacity-40',
    danger:
      'border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40',
  };
  return (
    <button
      className={`tap inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-semibold tracking-wide transition-colors disabled:cursor-not-allowed ${tones[tone] ?? tones.quiet} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="mb-5">
      <label
        className="block text-[11px] font-semibold text-neutral-400 tracking-[0.15em] uppercase mb-2"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] text-neutral-500 font-normal mt-2 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function TextInput({ className = '', ...rest }) {
  return <input className={`${FIELD_CLASS} ${className}`} {...rest} />;
}

export function SearchInput({ className = '', ...rest }) {
  return (
    <div className="relative">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-600 pointer-events-none"
        strokeWidth={2}
      />
      <input
        type="search"
        className={`w-full bg-[#111115] border border-[#282832] pl-9 pr-4 py-3 text-sm text-white placeholder-neutral-600 outline-none focus:border-purple-500/60 transition-colors ${className}`}
        {...rest}
      />
    </div>
  );
}

export function TextArea({ className = '', rows = 4, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={`${FIELD_CLASS} resize-y font-mono text-[13px] leading-relaxed ${className}`}
      {...rest}
    />
  );
}

export function SubNav({ tabs, active, onPick, badges, label = 'Sections' }) {
  const strip = React.useRef(null);

  React.useEffect(() => {
    const rail = strip.current;
    const current = rail?.querySelector('[data-current="true"]');
    if (!rail || !current) return;
    const left = current.offsetLeft - (rail.clientWidth - current.clientWidth) / 2;
    rail.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  return (
    <div
      ref={strip}
      className="rail snap-rail flex w-full sm:w-auto sm:inline-flex border border-[#282832] bg-[#0a0a0d] max-w-full"
      role="group"
      aria-label={label}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const current = tab.id === active;
        const count = badges?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onPick(tab.id)}
            aria-pressed={current}
            data-current={current ? 'true' : undefined}
            className={`tap inline-flex shrink-0 items-center gap-2 px-4 py-2.5 text-[12px] font-semibold tracking-wide whitespace-nowrap transition-colors ${
              current ? 'bg-purple-500/15 text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
            {tab.label}
            {count > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] px-1 py-[1px] rounded-full text-[10px] font-semibold tabular-nums ${
                  current ? 'bg-purple-500/40 text-white' : 'bg-[#1c1c22] text-neutral-400'
                }`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function WindowSwitch({ options, active, onPick, label = 'Time window', disabled }) {
  return (
    <div
      className="rail flex sm:inline-flex border border-[#282832] bg-[#0a0a0d] shrink-0 max-w-full"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const current = option.id === active;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.id)}
            aria-pressed={current}
            title={option.title}
            className={`tap shrink-0 px-3 py-2 text-[11px] font-semibold tracking-wide tabular-nums transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              current ? 'bg-purple-500/15 text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select({ children, ...rest }) {
  return (
    <select
      className="w-full bg-[#111115] border border-[#282832] px-4 py-3 text-sm text-white outline-none focus:border-purple-500/60 transition-colors"
      {...rest}
    >
      {children}
    </select>
  );
}

export function Check({ checked, onChange, label, hint, disabled }) {
  return (
    <label
      className={`flex items-start gap-3 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[2px] h-4 w-4 sm:h-3.5 sm:w-3.5 accent-purple-500 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-[13px] text-neutral-200 font-normal leading-tight">{label}</span>
        {hint && (
          <span className="block text-[11px] text-neutral-500 font-mono mt-1 break-words">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

export function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-[#282832] text-neutral-400',
    green: 'border-emerald-500/40 text-emerald-400',
    amber: 'border-amber-500/40 text-amber-300',
    rose: 'border-rose-500/40 text-rose-400',
    purple: 'border-purple-500/40 text-purple-300',
  };
  return (
    <span
      className={`inline-flex items-center border px-2 py-[3px] text-[10px] font-semibold tracking-[0.12em] uppercase ${tones[tone] ?? tones.neutral}`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }) {
  return (
    <div className="px-4 sm:px-6 py-8 text-[13px] text-neutral-500 font-normal">{children}</div>
  );
}

export function Sparkline({ points, labels, unit = 'requests', height = 40 }) {
  const values = Array.isArray(points) ? points : [];
  const peak = Math.max(1, ...values);
  const named = Array.isArray(labels) && labels.length === values.length;

  if (!named) {
    return (
      <div
        className="flex items-end gap-[2px] w-full"
        style={{ height }}
        role="img"
        aria-label={`${unit} per hour`}
      >
        {values.map((value, index) => (
          <span
            key={index}
            className={`flex-1 rounded-t-[4px] ${value > 0 ? 'bg-purple-500/70' : 'bg-[#1c1c22]'}`}
            style={{ height: `${Math.max(value > 0 ? 8 : 3, (value / peak) * 100)}%` }}
          />
        ))}
      </div>
    );
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  const peakAt = labels[values.indexOf(peak)] ?? '';

  return (
    <div
      className="flex items-end gap-[2px] w-full"
      role="img"
      aria-label={`${total} ${unit} over ${values.length} hours, busiest ${peak} at ${peakAt}`}
      style={{ height }}
    >
      {values.map((value, index) => {
        const edge =
          index < 3 ? 'left-0' : index > values.length - 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';
        return (
          <div
            key={index}
            className="group relative flex-1 h-full flex items-end outline-none"
          >
            <span
              className={`w-full rounded-t-[4px] transition-colors ${
                value > 0
                  ? 'bg-purple-500/70 group-hover:bg-purple-400 group-focus:bg-purple-400'
                  : 'bg-[#1c1c22] group-hover:bg-[#2a2a34] group-focus:bg-[#2a2a34]'
              }`}
              style={{ height: `${Math.max(value > 0 ? 8 : 3, (value / peak) * 100)}%` }}
            />
            <span
              className={`pointer-events-none absolute bottom-full mb-2 z-20 hidden group-hover:block group-focus:block whitespace-nowrap border border-[#282832] bg-[#111115] px-2.5 py-1.5 ${edge}`}
            >
              <span className="block text-[12px] text-white font-medium tabular-nums leading-none">
                {value.toLocaleString('en-GB')}
              </span>
              <span className="block text-[10px] text-neutral-500 font-normal mt-1 leading-none">
                {labels[index]}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
