import React from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import {
  TRAFFIC_DEFAULT,
  TRAFFIC_WINDOWS,
  fetchKeyUsage,
  formatCount,
  peakOf,
  pointLabel,
  seriesOf,
} from '../../../lib/admin';
import { Button, Empty, Notice, Panel, Sparkline, WindowSwitch } from '../ui';

export default function KeyTrend({ id, name, title = 'Usage over time' }) {
  const [span, setSpan] = React.useState(TRAFFIC_DEFAULT);
  const [series, setSeries] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [reading, setReading] = React.useState(false);

  const load = React.useCallback(
    (chosen) => {
      let dropped = false;
      setReading(true);
      fetchKeyUsage(id, chosen)
        .then((result) => {
          if (dropped) return;
          setSeries(result);
          setError(null);
        })
        .catch((failure) => {
          if (!dropped) setError(failure.message);
        })
        .finally(() => {
          if (!dropped) setReading(false);
        });
      return () => {
        dropped = true;
      };
    },
    [id],
  );

  React.useEffect(() => load(span), [load, span]);

  const points = series?.points ?? [];
  const step = series?.step ?? 'hour';
  const requests = seriesOf(points, 'requests');
  const refused = seriesOf(points, 'rejected');
  const barred = seriesOf(points, 'blocked');
  const marks = points.map((point) => pointLabel(point, step));
  const top = peakOf(points, 'requests');
  const totals = series?.totals ?? { requests: 0, rejected: 0, blocked: 0 };
  const anyRefused = refused.some((value) => value > 0) || barred.some((value) => value > 0);
  const chosen = TRAFFIC_WINDOWS.find((entry) => entry.id === span) ?? TRAFFIC_WINDOWS[2];

  return (
    <Panel
      title={name ? `${title} — ${name}` : title}
      icon={Activity}
      action={
        <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
          <WindowSwitch
            options={TRAFFIC_WINDOWS}
            active={span}
            onPick={setSpan}
            disabled={reading}
            label="How far back to read this key"
          />
          <Button type="button" onClick={() => load(span)} disabled={reading}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            {reading ? 'Reading…' : 'Refresh'}
          </Button>
        </div>
      }
    >
      {error && (
        <div className="px-4 sm:px-6 pt-5">
          <Notice tone="rose">{error}</Notice>
        </div>
      )}

      {series && !series.recorded ? (
        <Empty>
          Nothing has been recorded for this key yet. The gateway started keeping an hour by hour
          history when this panel gained it — a key that has not been called since will stay empty.
        </Empty>
      ) : (
        <>
          <div
            className={`px-4 sm:px-6 py-6 transition-opacity ${reading ? 'opacity-50' : 'opacity-100'}`}
          >
            <Sparkline
              points={requests}
              labels={marks}
              unit={step === 'day' ? 'calls per day' : 'calls per hour'}
              height={110}
            />
            <div className="flex items-baseline justify-between gap-4 mt-3">
              <span className="text-[10px] text-neutral-600 tracking-wider uppercase shrink-0">
                {marks[0] ?? '—'}
              </span>
              <span className="text-[11px] text-neutral-500 font-normal text-center truncate">
                {top.value > 0
                  ? `busiest ${step === 'day' ? 'day' : 'hour'} ${formatCount(top.value)} at ${pointLabel(top.at, step)}`
                  : `no calls in ${chosen.title}`}
              </span>
              <span className="text-[10px] text-neutral-600 tracking-wider uppercase shrink-0">
                now
              </span>
            </div>
          </div>

          {anyRefused && (
            <div className="px-4 sm:px-6 pb-6">
              <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
                Refused
              </p>
              <Sparkline
                points={refused.map((value, index) => value + barred[index])}
                labels={marks}
                unit="refusals"
                height={44}
              />
            </div>
          )}

          <div className="grid grid-cols-3 border-t border-[#17171d] -mb-px -mr-px">
            {[
              ['Calls', formatCount(totals.requests), 'text-white'],
              [
                'Refused',
                formatCount(totals.rejected),
                totals.rejected > 0 ? 'text-amber-300' : 'text-white',
              ],
              [
                'Wrong address',
                formatCount(totals.blocked),
                totals.blocked > 0 ? 'text-rose-400' : 'text-white',
              ],
            ].map(([label, value, tone]) => (
              <div key={label} className="px-4 sm:px-6 py-4 border-r border-b border-[#17171d]">
                <p className="text-[10px] font-semibold text-neutral-500 tracking-[0.15em] uppercase mb-2">
                  {label}
                </p>
                <p className={`text-[20px] font-normal tabular-nums leading-none ${tone}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
