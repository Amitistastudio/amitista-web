const TIMEOUT_MS = 8000;
const ENDPOINT = '/api/v1/exchange/fees';

export const LOADING = 'loading';
export const READY = 'ready';
export const UNAVAILABLE = 'unavailable';

const TICKER = {
  BTC: 'BTC',
  LTC: 'LTC',
  ETH: 'ETH',
  SOL: 'SOL',
  DOGE: 'DOGE',
  XMR: 'XMR',
  TRX: 'TRX',
  USDTTRC20: 'USDT',
  USDTERC20: 'USDT',
  USDCERC20: 'USDC',
};

const NETWORK = {
  USDTTRC20: 'TRC-20',
  USDTERC20: 'ERC-20',
  USDCERC20: 'ERC-20',
};

export function assetLabel(id) {
  const ticker = TICKER[id] ?? id;
  const network = NETWORK[id];
  return network ? `${ticker} (${network})` : ticker;
}

const finite = (value) => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
};

function coerceSample(sample) {
  if (!sample || typeof sample !== 'object') return null;
  const send = finite(sample.send);
  const fee = finite(sample.fee);
  const pct = finite(sample.pct);
  if (send === null || fee === null || pct === null) return null;
  return { send, fee, pct };
}

function coercePair(pair) {
  if (!pair || typeof pair !== 'object') return null;
  if (typeof pair.from !== 'string' || typeof pair.to !== 'string') return null;

  const fixed = finite(pair.model?.fixed);
  const proportional = finite(pair.model?.proportional);
  if (fixed === null || proportional === null) return null;

  const samples = Array.isArray(pair.samples) ? pair.samples.map(coerceSample).filter(Boolean) : [];
  if (samples.length === 0) return null;

  return { from: pair.from, to: pair.to, fixed, proportional, samples };
}

function coercePrices(prices) {
  if (!prices || typeof prices !== 'object') return {};
  const out = {};
  for (const [id, value] of Object.entries(prices)) {
    const price = finite(value);
    if (price !== null && price > 0) out[id] = price;
  }
  return out;
}

function coercePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const pairs = Array.isArray(payload.pairs) ? payload.pairs.map(coercePair).filter(Boolean) : [];
  if (pairs.length === 0) return null;

  return {
    measuredAt: typeof payload.measuredAt === 'string' ? payload.measuredAt : null,
    currency: payload.currency === 'USD' || payload.currency === 'GBP' ? payload.currency : 'EUR',
    prices: coercePrices(payload.prices),
    pairs,
  };
}

export async function fetchFees() {
  const signal =
    typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(TIMEOUT_MS)
      : undefined;

  let response;
  try {
    response = await fetch(ENDPOINT, { signal, headers: { Accept: 'application/json' } });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    return coercePayload(await response.json());
  } catch {
    return null;
  }
}

export function costOf(pair, amount) {
  if (!pair || !Number.isFinite(amount) || amount <= 0) return null;
  const fee = pair.fixed + pair.proportional * amount;
  const bounded = Math.min(Math.max(fee, 0), amount);
  return { fee: bounded, receive: amount - bounded, pct: (bounded / amount) * 100 };
}

export const SYMBOL = { EUR: '€', USD: '$', GBP: '£' };

export function money(value, currency) {
  const symbol = SYMBOL[currency] ?? '€';
  return `${symbol}${value.toFixed(2)}`;
}

const PLACES = { BTC: 6, ETH: 5, LTC: 4, SOL: 3, DOGE: 1, XMR: 4, TRX: 1 };

export function coin(value, assetId, prices) {
  const price = prices?.[assetId];
  if (!Number.isFinite(price) || price <= 0) return null;
  const units = value / price;
  const places = PLACES[assetId] ?? 2;
  return `${units.toFixed(places)} ${assetLabel(assetId)}`;
}

export function feeParts(pair, amount) {
  if (!pair || !Number.isFinite(amount) || amount <= 0) return null;
  const network = Math.min(pair.fixed, amount);
  const spread = Math.max(pair.proportional * amount, 0);
  const total = network + spread;
  if (total <= 0) return null;
  return {
    network,
    spread,
    total,
    networkShare: (network / total) * 100,
    spreadShare: (spread / total) * 100,
  };
}
