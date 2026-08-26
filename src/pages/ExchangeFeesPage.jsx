import React from 'react';
import { ArrowRight, Radio, ShieldCheck, Coins, Scale } from 'lucide-react';
import Silk from '../components/Silk';
import Reveal from '../components/Reveal';
import Header from '../components/web1/Header';
import Footer from '../components/web1/Footer';
import { STUDIO_NAME, DISCORD_INVITE } from '../siteConfig';
import {
  fetchFees,
  assetLabel,
  costOf,
  feeParts,
  coin,
  money,
  SYMBOL,
  LOADING,
  READY,
  UNAVAILABLE,
} from '../lib/exchangeFees';
import { relativeTime } from '../lib/status';

/**
 * The figures the page falls back to when no live snapshot can be read —
 * a real measurement, kept in the markup so the page is never blank and so a
 * crawler that runs no JavaScript still sees honest numbers.
 */
const FALLBACK = {
  measuredAt: '2026-08-23T23:12:31.153Z',
  currency: 'EUR',
  prices: { LTC: 44.81, SOL: 81.7, BTC: 66350.0, ETH: 2099.87, USDTTRC20: 0.86, USDTERC20: 0.86 },
  pairs: [
    { from: 'LTC', to: 'SOL', fixed: 0.0233, proportional: 0.001979, samples: [{ send: 11.20, fee: 0.04, pct: 0.40 }] },
    { from: 'LTC', to: 'BTC', fixed: 0.1412, proportional: 0.006106, samples: [{ send: 11.20, fee: 0.20, pct: 1.87 }] },
    { from: 'BTC', to: 'LTC', fixed: 0.1243, proportional: 0.006431, samples: [{ send: 99.52, fee: 0.76, pct: 0.76 }] },
    { from: 'ETH', to: 'BTC', fixed: 0.1349, proportional: 0.006479, samples: [{ send: 20.99, fee: 0.27, pct: 1.29 }] },
    { from: 'SOL', to: 'LTC', fixed: 0.0171, proportional: 0.00816, samples: [{ send: 24.51, fee: 0.21, pct: 0.88 }] },
    { from: 'LTC', to: 'USDTTRC20', fixed: 0.4979, proportional: 0.00716, samples: [{ send: 11.20, fee: 0.57, pct: 5.16 }] },
    { from: 'BTC', to: 'USDTERC20', fixed: 0.1534, proportional: 0.006349, samples: [{ send: 99.52, fee: 0.78, pct: 0.78 }] },
  ],
};

const AMOUNTS = [25, 50, 100, 250, 500, 1000, 2500];

/** The amount the board and the "cheapest" badge are judged at. */
const BENCHMARK = 250;

function cheapestPair(pairs) {
  let best = null;
  for (const pair of pairs) {
    const cost = costOf(pair, BENCHMARK);
    if (cost && (best === null || cost.pct < best.pct)) best = { pair, pct: cost.pct };
  }
  return best;
}

function Stat({ value, label, hint }) {
  return (
    <div className="flex-1 min-w-[150px] px-5 py-5 text-left">
      <div className="text-3xl sm:text-4xl font-normal text-white tracking-tight">{value}</div>
      <div className="mt-1.5 text-[13px] font-medium text-neutral-300">{label}</div>
      {hint ? <div className="mt-1 text-xs text-neutral-500 leading-relaxed">{hint}</div> : null}
    </div>
  );
}

function LiveDot({ live }) {
  return (
    <span className="relative flex h-2 w-2" aria-hidden="true">
      {live ? (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      ) : null}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-neutral-500'}`}
      />
    </span>
  );
}

function Checker({ data, currency }) {
  const [pairIndex, setPairIndex] = React.useState(0);
  const [amount, setAmount] = React.useState(250);
  // The breakdown bar sizes its two segments with a style attribute, and the
  // site's CSP (style-src 'self') blocks those — so the prerender must not
  // emit one. Widths are applied only once the client has mounted; before
  // that the track renders empty, which costs a decoration, not information.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const pair = data.pairs[Math.min(pairIndex, data.pairs.length - 1)];
  const cost = costOf(pair, amount);
  const parts = feeParts(pair, amount);
  const symbol = SYMBOL[currency] ?? '€';
  const sendCoin = coin(amount, pair.from, data.prices);
  const receiveCoin = cost ? coin(cost.receive, pair.to, data.prices) : null;

  return (
    <div className="w-full rounded-xl border border-[#282832] bg-[#0a0a0d]/80 backdrop-blur-sm overflow-hidden">
      <div className="flex flex-wrap gap-2 px-5 pt-5 pb-4 border-b border-[#1c1c24]">
        {data.pairs.map((option, index) => (
          <button
            key={`${option.from}-${option.to}`}
            type="button"
            onClick={() => setPairIndex(index)}
            aria-pressed={index === pairIndex}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              index === pairIndex
                ? 'border-purple-400/40 bg-purple-500/15 text-white'
                : 'border-[#282832] bg-[#111115]/60 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {assetLabel(option.from)}
            <ArrowRight className="h-3 w-3 opacity-60" aria-hidden="true" />
            {assetLabel(option.to)}
          </button>
        ))}
      </div>

      <div className="px-5 py-6">
        <label
          htmlFor="fee-amount"
          className="block text-[11px] font-semibold tracking-[0.18em] text-neutral-500 mb-3"
        >
          YOU SEND
        </label>

        <div className="flex items-baseline gap-1 mb-5">
          <span className="text-2xl text-neutral-500">{symbol}</span>
          <input
            id="fee-amount"
            type="number"
            min="5"
            max="5000"
            step="5"
            value={amount}
            onChange={(event) => {
              const next = Number.parseFloat(event.target.value);
              setAmount(Number.isFinite(next) ? Math.min(Math.max(next, 1), 5000) : 1);
            }}
            className="w-40 bg-transparent text-4xl font-normal text-white tracking-tight outline-none border-b border-transparent focus:border-purple-400/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        <input
          type="range"
          min="10"
          max="2500"
          step="10"
          value={Math.min(amount, 2500)}
          onChange={(event) => setAmount(Number.parseFloat(event.target.value))}
          aria-label="Amount to send"
          className="w-full accent-purple-400 mb-4"
        />

        <div className="flex flex-wrap gap-1.5 mb-7">
          {AMOUNTS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(preset)}
              className={`rounded-md border px-2.5 py-1 text-xs tabular-nums transition-colors ${
                amount === preset
                  ? 'border-purple-400/40 bg-purple-500/15 text-white'
                  : 'border-[#282832] text-neutral-500 hover:text-neutral-200'
              }`}
            >
              {symbol}
              {preset}
            </button>
          ))}
        </div>

        <div className="grid gap-px bg-[#1c1c24] border border-[#1c1c24] rounded-lg overflow-hidden sm:grid-cols-3">
          <div className="bg-[#0d0d11] px-4 py-4">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-neutral-500 mb-1.5">
              YOU SEND
            </div>
            <div className="text-2xl text-white tabular-nums">{sendCoin ?? money(amount, currency)}</div>
            <div className="mt-1 text-xs text-neutral-500 tabular-nums">
              {sendCoin ? money(amount, currency) : assetLabel(pair.from)}
            </div>
          </div>
          <div className="bg-[#0d0d11] px-4 py-4">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-neutral-500 mb-1.5">
              FEE
            </div>
            <div className="text-2xl text-white tabular-nums">
              {cost ? money(cost.fee, currency) : '—'}
            </div>
            <div className="mt-1 text-xs text-neutral-500 tabular-nums">
              {cost ? `${cost.pct.toFixed(2)}% of what you send` : '—'}
            </div>
          </div>
          <div className="bg-[#0d0d11] px-4 py-4">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-neutral-500 mb-1.5">
              YOU RECEIVE
            </div>
            <div className="text-2xl text-emerald-300 tabular-nums">
              {receiveCoin ? `≈ ${receiveCoin}` : cost ? `≈ ${money(cost.receive, currency)}` : '—'}
            </div>
            <div className="mt-1 text-xs text-neutral-500 tabular-nums">
              {receiveCoin && cost ? `≈ ${money(cost.receive, currency)}` : `in ${assetLabel(pair.to)}`}
            </div>
          </div>
        </div>

        {parts ? (
          <div className="mt-5">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.18em] text-neutral-500 mb-2">
              <span>WHAT THE FEE IS MADE OF</span>
              <span className="tabular-nums text-neutral-400">{money(parts.total, currency)}</span>
            </div>
            <div
              className="flex h-2 w-full overflow-hidden rounded-full bg-[#15151b]"
              role="img"
              aria-label={`Network cost ${money(parts.network, currency)}, desk spread ${money(
                parts.spread,
                currency,
              )}`}
            >
              <span
                className="bg-sky-400/70 transition-[width] duration-200"
                style={mounted ? { width: `${parts.networkShare}%` } : undefined}
              />
              <span
                className="bg-purple-400/70 transition-[width] duration-200"
                style={mounted ? { width: `${parts.spreadShare}%` } : undefined}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-400/70" aria-hidden="true" />
                Network cost
                <span className="tabular-nums text-neutral-400">{money(parts.network, currency)}</span>
                <span className="text-neutral-600">flat, whatever the size</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-400/70" aria-hidden="true" />
                Desk spread
                <span className="tabular-nums text-neutral-400">{money(parts.spread, currency)}</span>
                <span className="text-neutral-600">{(pair.proportional * 100).toFixed(2)}%</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-neutral-700" aria-hidden="true" />
                Studio
                <span className="tabular-nums text-neutral-400">{money(0, currency)}</span>
              </span>
            </div>
          </div>
        ) : null}

        <p className="mt-5 pt-4 border-t border-[#1c1c24] text-xs text-neutral-500 leading-relaxed">
          Worked out from the live measurement above, not a rate card. Rates move — the quote you
          are given in Discord is the one that binds.
        </p>
      </div>
    </div>
  );
}

function Board({ data, currency }) {
  const cheapest = cheapestPair(data.pairs);
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[19rem] sm:min-w-[36rem] border-collapse text-left text-[13px] sm:text-sm">
        <thead>
          <tr className="border-b border-[#282832] text-[11px] font-semibold tracking-[0.18em] text-neutral-500">
            <th className="py-3 pr-3 sm:pr-4">PAIR</th>
            <th className="py-3 pr-3 sm:pr-4 text-right">{SYMBOL[currency] ?? '€'}50</th>
            <th className="py-3 pr-3 sm:pr-4 text-right">{SYMBOL[currency] ?? '€'}250</th>
            <th className="py-3 pr-3 sm:pr-4 text-right">{SYMBOL[currency] ?? '€'}1,000</th>
            <th className="hidden sm:table-cell py-3 text-right">NETWORK COST</th>
          </tr>
        </thead>
        <tbody>
          {data.pairs.map((pair) => (
            <tr key={`${pair.from}-${pair.to}`} className="border-b border-[#15151b]">
              <td className="py-3 pr-3 sm:pr-4 whitespace-nowrap text-neutral-200">
                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    {assetLabel(pair.from)}
                    <ArrowRight className="h-3 w-3 text-neutral-600" aria-hidden="true" />
                    {assetLabel(pair.to)}
                  </span>
                  {cheapest && cheapest.pair === pair ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-300">
                      CHEAPEST
                    </span>
                  ) : null}
                </span>
              </td>
              {[50, 250, 1000].map((size) => {
                const cost = costOf(pair, size);
                return (
                  <td
                    key={size}
                    className="py-3 pr-3 sm:pr-4 text-right tabular-nums text-neutral-300 whitespace-nowrap"
                  >
                    {cost ? `${cost.pct.toFixed(2)}%` : '—'}
                  </td>
                );
              })}
              <td className="hidden sm:table-cell py-3 text-right tabular-nums text-neutral-500 whitespace-nowrap">
                {money(pair.fixed, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-[#282832] bg-[#0a0a0d]/60 p-6 text-left">
      <Icon className="h-5 w-5 text-purple-300/80 mb-4" aria-hidden="true" />
      <h3 className="text-base font-medium text-white mb-2 tracking-tight">{title}</h3>
      <p className="text-sm text-neutral-400 leading-relaxed">{children}</p>
    </div>
  );
}

export default function ExchangeFeesPage() {
  const [state, setState] = React.useState(LOADING);
  const [data, setData] = React.useState(FALLBACK);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const previous = document.title;
    document.title = `Exchange fees — ${STUDIO_NAME}`;
    return () => {
      document.title = previous;
    };
  }, []);

  const cancelled = React.useRef(false);

  const load = React.useCallback(async () => {
    const result = await fetchFees();
    if (cancelled.current) return;
    if (result) {
      setData(result);
      setState(READY);
    } else {
      // Keep whatever is on screen. The baked-in measurement is real, just
      // older — a blank panel would be a worse answer than a dated one.
      setState(UNAVAILABLE);
    }
    setNow(Date.now());
  }, []);

  React.useEffect(() => {
    cancelled.current = false;
    load();
    const poll = setInterval(load, 300000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      cancelled.current = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  // Only once the client has actually looked. Rendered during prerender this
  // would bake "23 minutes ago" into the markup and it would still say that
  // tomorrow, which is worse than saying nothing.
  const measuredAgo = state === LOADING ? null : relativeTime(data.measuredAt, now);
  const live = state === READY;
  const cheapest = cheapestPair(data.pairs);

  return (
    <div className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans">
      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="w-full flex justify-center bg-[#060608] flex-1 focus:outline-none"
      >
        <section className="w-full max-w-[1480px] border-x border-[#282832] relative flex flex-col items-center justify-start overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[560px] z-0 pointer-events-none">
            <Silk
              color="#8864f2"
              speed={4.5}
              scale={1.6}
              noiseIntensity={1.4}
              rotation={0.2}
              fadeEdge={true}
              className="absolute inset-0 w-full h-full opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608]/25 via-[#060608]/65 to-[#060608]" />
          </div>

          <div className="absolute inset-x-0 top-[500px] bottom-0 z-0 pointer-events-none">
            <div className="absolute inset-0 dot-grid opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060608] via-transparent to-[#060608]" />
          </div>

          <div className="relative z-30 w-full flex flex-col items-center pt-24 pb-24 px-6 sm:px-10 md:px-16 lg:px-20">
            <Reveal rise className="w-full flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#222228] bg-[#111115]/50 text-xs sm:text-[13px] font-medium text-neutral-300 mb-6 select-none">
                <LiveDot live={live} />
                {live ? 'LIVE RATES' : 'EXCHANGE FEES'}
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-normal text-white tracking-tight leading-none mb-6 max-w-4xl">
                We take
                <br />
                nothing.
              </h1>
              <p className="text-sm sm:text-base text-neutral-400 font-normal max-w-[560px] text-center leading-relaxed mb-4 tracking-tight">
                No commission, no service charge, no spread of ours. What an exchange costs is
                what the market charges to move the coin — and the number below is measured
                against the live desks, not written by us.
              </p>
              <p className="text-xs text-neutral-500 mb-14 tabular-nums">
                {measuredAgo ? `Measured ${measuredAgo}` : 'Measured against the live desks'}
                {state === UNAVAILABLE ? ' · live feed unreachable, showing the last measurement' : ''}
              </p>
            </Reveal>

            <Reveal
              rise
              className="w-full max-w-[980px] flex flex-wrap gap-px bg-[#282832] border border-[#282832] rounded-xl overflow-hidden mb-16"
            >
              <div className="flex flex-wrap w-full bg-[#060608] gap-px">
                <div className="flex-1 min-w-[150px] bg-[#0a0a0d]">
                  <Stat value="0%" label="Added by the studio" hint="There is no margin of ours in the rate." />
                </div>
                <div className="flex-1 min-w-[150px] bg-[#0a0a0d]">
                  <Stat
                    value={`${data.pairs.length}`}
                    label="Pairs measured live"
                    hint="Re-probed every fifteen minutes."
                  />
                </div>
                <div className="flex-1 min-w-[150px] bg-[#0a0a0d]">
                  <Stat
                    value={cheapest ? `${cheapest.pct.toFixed(2)}%` : '—'}
                    label="Cheapest right now"
                    hint={
                      cheapest
                        ? `${assetLabel(cheapest.pair.from)} → ${assetLabel(cheapest.pair.to)} on ${
                            SYMBOL[data.currency] ?? '€'
                          }${BENCHMARK}.`
                        : 'Measured across every pair.'
                    }
                  />
                </div>
              </div>
            </Reveal>

            <Reveal rise className="w-full max-w-[980px] mb-20">
              <h2 className="text-left text-2xl sm:text-3xl font-normal text-white tracking-tight mb-2">
                Check it yourself
              </h2>
              <p className="text-left text-sm text-neutral-400 mb-6 max-w-[620px] leading-relaxed">
                Pick a pair and an amount. This is the same arithmetic the bot does when it
                quotes you, run against the most recent live measurement.
              </p>
              <Checker data={data} currency={data.currency} />
            </Reveal>

            <Reveal rise className="w-full max-w-[980px] mb-20">
              <h2 className="text-left text-2xl sm:text-3xl font-normal text-white tracking-tight mb-2">
                Every pair, three sizes
              </h2>
              <p className="text-left text-sm text-neutral-400 mb-6 max-w-[620px] leading-relaxed">
                Read across a row and the percentage falls as the amount grows. That is the
                network fee — a flat cost that does not scale — becoming a smaller share of a
                larger swap.
              </p>
              <Board data={data} currency={data.currency} />
            </Reveal>

            <Reveal rise className="w-full max-w-[980px] grid gap-4 sm:grid-cols-2 mb-20">
              <Card icon={Scale} title="Why there is no flat percentage">
                A swap desk charges a rate, not a fee, and the rate already has its costs in it.
                Quoting you a headline percentage would be a number we invented. So we show the
                only figure that can be checked: the market value of what you send, minus the
                market value of what you receive, both priced at the moment you were quoted.
              </Card>
              <Card icon={Radio} title="Two desks, every time">
                Every exchange is quoted against more than one desk at once and filled by
                whichever pays out the most for your amount. You are not shown a list and you do
                not choose — the comparison runs on every swap, and the winner is simply the rate
                you get.
              </Card>
              <Card icon={ShieldCheck} title="What is never charged for">
                Opening, cancelling or abandoning an exchange. One that expires unpaid. Over- or
                underpaying — the payout is recalculated at the same rate either way, and nothing
                is withheld. And an exchange we put on hold for review, which is our problem to
                resolve, not yours to pay for.
              </Card>
              <Card icon={Coins} title="Where your money goes">
                Not to us. Your deposit goes to the swap desk directly and the payout is sent
                from that desk straight to your wallet. {STUDIO_NAME} never holds your funds at
                any point, which is also why there is no balance here to charge a fee against.
              </Card>
            </Reveal>

            <Reveal rise className="w-full max-w-[980px]">
              <div className="rounded-xl border border-[#282832] bg-[#0a0a0d]/60 px-6 py-6 text-left">
                <h2 className="text-lg font-medium text-white tracking-tight mb-5">Limits</h2>
                <dl className="grid gap-6 sm:grid-cols-3">
                  {[
                    { term: 'Most per exchange', value: '≈ $5,000', note: 'Refused before any deposit address is issued.' },
                    { term: 'Open at once', value: 'Three', note: 'Per person, across the whole desk.' },
                    { term: 'Quote holds for', value: '60 minutes', note: 'Unpaid after that it expires, costing nothing.' },
                  ].map((limit) => (
                    <div key={limit.term}>
                      <dt className="text-[11px] font-semibold tracking-[0.18em] text-neutral-500 mb-1.5">
                        {limit.term.toUpperCase()}
                      </dt>
                      <dd className="text-xl text-white tracking-tight">{limit.value}</dd>
                      <dd className="mt-1 text-xs text-neutral-500 leading-relaxed">{limit.note}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-6 pt-5 border-t border-[#1c1c24] text-xs text-neutral-500 leading-relaxed">
                  Gift cards and top-ups work the same way and carry no margin of ours either:
                  you pay the supplier&rsquo;s invoice directly and the code is sent to you. Cards
                  go up to 500 in their own currency, three unpaid orders at a time, and an
                  invoice holds for thirty minutes. The commercial terms are in the{' '}
                  <a
                    href="/terms"
                    className="text-neutral-300 underline underline-offset-4 hover:text-white transition-colors"
                  >
                    terms of service
                  </a>
                  .
                </p>
              </div>
            </Reveal>

            <Reveal rise className="w-full max-w-[980px] mt-6">
              <a
                href={DISCORD_INVITE}
                target="_blank"
                rel="noreferrer"
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-5 overflow-hidden rounded-xl border border-[#282832] bg-[#0a0a0d] px-7 py-8 transition-colors hover:border-purple-400/30"
              >
                <div className="relative z-10 text-left">
                  <div className="text-lg sm:text-xl font-normal text-white tracking-tight mb-1.5">
                    Start an exchange
                  </div>
                  <p className="text-sm text-neutral-400 leading-relaxed max-w-[520px]">
                    The desk runs in Discord. Press one button, answer four questions, and you
                    get a quote with this same fee on it before anything moves.
                  </p>
                </div>
                <span className="relative z-10 inline-flex items-center gap-2 shrink-0 rounded-lg border border-[#282832] bg-[#111115] px-4 py-2.5 text-[13px] font-medium text-neutral-200 transition-colors group-hover:border-purple-400/40 group-hover:text-white">
                  Open Discord
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
