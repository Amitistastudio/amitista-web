import React from 'react';
import { formatLeaf, jsonLines, visibleLines } from '../../lib/jsonLines';

const VALUE_CLASS = {
  string: 'text-emerald-300/85',
  number: 'text-sky-300/90',
  boolean: 'text-amber-300/90',
  null: 'text-neutral-600',
};

const INDENT = 14;

function Line({ line, active, collapsed, onPick, onToggle }) {
  const indent = { paddingLeft: `${line.depth * INDENT}px` };

  if (line.kind === 'close') {
    return (
      <div style={indent} className="text-neutral-600">
        {line.bracket}
        {line.comma && ','}
      </div>
    );
  }

  const isActive = active && line.path === active;
  const pickable = Boolean(line.path);

  const keyLabel = line.key !== null && line.key !== undefined && (
    <>
      <span className={isActive ? 'text-violet-200' : 'text-violet-300/90'}>
        &quot;{line.key}&quot;
      </span>
      <span className="text-neutral-600">: </span>
    </>
  );

  const body =
    line.kind === 'open' ? (
      <>
        {keyLabel}
        <span className="text-neutral-500">{line.bracket}</span>
        {(collapsed || line.empty) && (
          <>
            <span className="text-neutral-700 px-1.5">
              {line.empty ? '' : `… ${line.summary}`}
            </span>
            <span className="text-neutral-500">{line.bracket === '[' ? ']' : '}'}</span>
          </>
        )}
      </>
    ) : (
      <>
        {keyLabel}
        <span className={VALUE_CLASS[line.type] ?? 'text-neutral-300'}>
          {formatLeaf(line.value, line.type)}
        </span>
        {line.comma && <span className="text-neutral-600">,</span>}
      </>
    );

  return (
    <div
      style={indent}
      className={`group/line relative flex items-start ${
        isActive ? 'bg-violet-500/12' : 'hover:bg-white/[0.035]'
      }`}
    >
      {isActive && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-violet-400" />}

      {line.kind === 'open' && !line.empty && (
        <button
          type="button"
          onClick={() => onToggle(line.id)}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          className="mr-1 -ml-3.5 w-3 shrink-0 cursor-pointer text-neutral-600 hover:text-violet-300"
        >
          {collapsed ? '+' : '−'}
        </button>
      )}

      {pickable ? (
        <button
          type="button"
          onClick={() => onPick(line.path, line.value)}
          className="min-w-0 flex-1 cursor-pointer text-left break-all"
        >
          {body}
        </button>
      ) : (
        <span className="min-w-0 flex-1 break-all">{body}</span>
      )}
    </div>
  );
}

const AUTO_COLLAPSE_OVER = 12;

function autoCollapsed(lines) {
  return new Set(
    lines
      .filter(
        (line) =>
          line.kind === 'open' &&
          Array.isArray(line.value) &&
          line.value.length > AUTO_COLLAPSE_OVER,
      )
      .map((line) => line.id),
  );
}

export default function JsonView({ value, active, onPick }) {
  const lines = React.useMemo(() => jsonLines(value), [value]);

  const [collapsed, setCollapsed] = React.useState(() => autoCollapsed(lines));

  React.useEffect(() => {
    setCollapsed(autoCollapsed(lines));
  }, [lines]);

  const toggle = React.useCallback((id) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const shown = React.useMemo(() => visibleLines(lines, collapsed), [lines, collapsed]);

  return (
    <div className="font-tech text-[12.5px] leading-[1.75] tracking-tight">
      {shown.map((line) => (
        <Line
          key={line.id}
          line={line}
          active={active}
          collapsed={collapsed.has(line.id)}
          onPick={onPick}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}
