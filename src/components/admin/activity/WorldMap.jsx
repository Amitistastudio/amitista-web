import React from 'react';
import {
  COUNTRY_CENTRES,
  COUNTRY_SHAPES,
  COUNTRY_SMALL,
  MAP_HEIGHT,
  MAP_WIDTH,
} from '../../../content/countryShapes';
import { countryFlag, countryName, formatCount } from '../../../lib/admin';

const SCALES = {
  purple: ['#1b1b23', '#3b2a63', '#553494', '#7040c4', '#8b5cf6', '#a78bfa'],
  rose: ['#1b1b23', '#4a2030', '#6d2740', '#983050', '#c0405f', '#fb7185'],
};

const EMPTY = '#15151b';
const EDGE = '#282832';

function level(value, peak, steps) {
  if (!value || peak <= 0) return 0;
  const share = Math.log1p(value) / Math.log1p(peak);
  return Math.min(steps - 1, Math.max(1, Math.round(share * (steps - 1))));
}

export default function WorldMap({
  rows,
  tone = 'purple',
  unit = 'people',
  secondUnit = 'pages',
  caption,
}) {
  const [hovered, setHovered] = React.useState(null);
  const [pinned, setPinned] = React.useState(null);

  const scale = SCALES[tone] ?? SCALES.purple;
  const byCode = React.useMemo(() => {
    const out = new Map();
    for (const row of rows ?? []) {
      if (typeof row?.name !== 'string') continue;
      out.set(row.name.toUpperCase(), row);
    }
    return out;
  }, [rows]);

  const peak = Math.max(0, ...[...byCode.values()].map((row) => row.count ?? 0));
  const active = pinned ?? hovered;
  const shown = active ? byCode.get(active) : null;
  const marks = [...byCode.keys()].filter(
    (code) => (!COUNTRY_SHAPES[code] || COUNTRY_SMALL.has(code)) && COUNTRY_CENTRES[code],
  );

  const codes = Object.keys(COUNTRY_SHAPES);

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="relative">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="w-full h-auto block select-none"
          role="img"
          aria-label={
            byCode.size === 0
              ? 'A world map with nothing marked on it yet'
              : `A world map. ${byCode.size} countries have activity. Busiest: ${[...byCode.values()]
                  .slice(0, 3)
                  .map((row) => `${countryName(row.name)} ${row.count}`)
                  .join(', ')}.`
          }
          onMouseLeave={() => setHovered(null)}
        >
          <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="transparent" />

          {codes.map((code) => {
            const row = byCode.get(code);
            const step = level(row?.count ?? 0, peak, scale.length);
            const lit = active === code;
            return (
              <path
                key={code}
                d={COUNTRY_SHAPES[code]}
                fill={row ? scale[step] : EMPTY}
                stroke={lit ? '#ffffff' : EDGE}
                strokeWidth={lit ? 1.2 : 0.4}
                strokeLinejoin="round"
                className={row ? 'cursor-pointer' : ''}
                style={{ transition: 'fill 150ms ease' }}
                onMouseEnter={() => setHovered(code)}
                onClick={() => setPinned((current) => (current === code ? null : code))}
                tabIndex={row ? 0 : undefined}
                onFocus={row ? () => setHovered(code) : undefined}
                onBlur={row ? () => setHovered(null) : undefined}
              />
            );
          })}

          {marks.map((code) => {
            const row = byCode.get(code);
            const [x, y] = COUNTRY_CENTRES[code];
            const step = level(row?.count ?? 0, peak, scale.length);
            const lit = active === code;
            return (
              <g key={`mark-${code}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={lit ? 5 : 3.6}
                  fill={scale[Math.max(2, step)]}
                  stroke={lit ? '#ffffff' : '#0a0a0d'}
                  strokeWidth={1}
                  className="cursor-pointer"
                  style={{ transition: 'r 150ms ease' }}
                  onMouseEnter={() => setHovered(code)}
                  onClick={() => setPinned((current) => (current === code ? null : code))}
                  tabIndex={0}
                  onFocus={() => setHovered(code)}
                  onBlur={() => setHovered(null)}
                />
              </g>
            );
          })}
        </svg>

        {shown && (
          <div className="pointer-events-none absolute top-2 left-2 border border-[#282832] bg-[#111115]/95 px-4 py-3 min-w-[180px]">
            <p className="text-[13px] text-white font-normal flex items-center gap-2 mb-2">
              <span className="text-[16px] leading-none">{countryFlag(shown.name)}</span>
              {countryName(shown.name)}
            </p>
            <p className="text-[20px] text-white font-normal tabular-nums leading-none">
              {formatCount(shown.count)}
              <span className="text-[12px] text-neutral-500 font-normal ml-1.5">{unit}</span>
            </p>
            {typeof shown.views === 'number' && (
              <p className="text-[12px] text-neutral-400 tabular-nums mt-2">
                {formatCount(shown.views)} {secondUnit}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-4">
        <p className="text-[11px] text-neutral-600 font-normal">
          {caption ?? 'Hover a country to read it. Click to keep it open.'}
          {marks.length > 0 && ' Places too small to draw are shown as dots.'}
        </p>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-neutral-600 tracking-wider uppercase">none</span>
          {scale.map((colour) => (
            <span key={colour} className="h-2.5 w-4" style={{ backgroundColor: colour }} />
          ))}
          <span className="text-[10px] text-neutral-600 tracking-wider uppercase">
            {formatCount(peak)}
          </span>
        </span>
      </div>
    </div>
  );
}
