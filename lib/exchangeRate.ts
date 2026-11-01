// 환율 API 관련 유틸리티

const EXCHANGE_RATE_CACHE_KEY = 'exchange-rate-cache';
const CACHE_VERSION = 2;
const CACHE_DURATION = 1 * 60 * 1000; // 1분

interface ExchangeRateCache {
  rates: Record<string, number>;
  timestamp: number;
  version?: number;
}

let exchangeRateRequest: Promise<Record<string, number>> | null = null;

export function getFallbackRates(): Record<string, number> {
  return {
    USD: 1,
    KRW: 1300,
    EUR: 0.92,
    USD_TO_KRW: 1300,
    KRW_TO_USD: 1 / 1300,
    USD_TO_EUR: 0.92,
    EUR_TO_USD: 1 / 0.92,
    KRW_TO_EUR: 0.92 / 1300,
    EUR_TO_KRW: 1300 / 0.92,
  };
}

type RateSource = 'live' | 'stale' | 'fallback';
let rateSource: RateSource = 'fallback';
let latestRates: Record<string, number> | null = null;

function validRates(rates: Record<string, number>): boolean {
  return rates && ['USD_TO_KRW', 'EUR_TO_KRW', 'KRW_TO_USD', 'KRW_TO_EUR', 'USD_TO_EUR', 'EUR_TO_USD']
    .every(key => Number.isFinite(rates[key]) && rates[key] > 0);
}

function readCache(): ExchangeRateCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const cache = JSON.parse(localStorage.getItem(EXCHANGE_RATE_CACHE_KEY) || 'null');
    return cache?.version === CACHE_VERSION && Number.isFinite(cache.timestamp) && validRates(cache.rates) ? cache : null;
  } catch { return null; }
}

// Synchronous summaries reuse exactly the rates already used by the screens.
export function getCachedExchangeRates(): Record<string, number> {
  if (latestRates) return latestRates;
  const cache = readCache();
  if (cache) {
    rateSource = Date.now() - cache.timestamp < CACHE_DURATION ? 'live' : 'stale';
    return cache.rates;
  }
  rateSource = 'fallback';
  return getFallbackRates();
}

export function getExchangeRateNotice(): string {
  if (rateSource === 'stale') return '마지막 저장 환율 기준';
  if (rateSource === 'fallback') return '환율 조회 불가 · 대체 환율 기준';
  return '';
}

export async function getExchangeRates(): Promise<Record<string, number>> {
  const cached = readCache();
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    latestRates = cached.rates;
    rateSource = 'live';
    return cached.rates;
  }
  if (!exchangeRateRequest) {
    exchangeRateRequest = (async () => {
      try {
        const response = await fetch(`/api/exchange-rate?_t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch exchange rates');
        const rates = await response.json();
        if (!validRates(rates)) throw new Error('Invalid exchange rates');
        latestRates = rates;
        rateSource = 'live';
        if (typeof window !== 'undefined') {
          // A full browser cache must not discard a valid server response.
          try { localStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify({ rates, timestamp: Date.now(), version: CACHE_VERSION })); }
          catch { /* retain the valid in-memory rate */ }
        }
        return rates;
      } catch {
        const previous = readCache();
        const rates = previous?.rates || latestRates || getFallbackRates();
        rateSource = previous || latestRates ? 'stale' : 'fallback';
        if (previous || latestRates) latestRates = rates;
        return rates;
      }
    })();
  }
  try { return await exchangeRateRequest; }
  finally { exchangeRateRequest = null; }
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;

  const rates = await getExchangeRates();
  const key = `${from}_TO_${to}`;

  if (rates[key]) {
    return amount * rates[key];
  }

  // 직접 계산
  if (from === 'USD' && to === 'KRW') {
    return amount * rates.USD_TO_KRW;
  } else if (from === 'KRW' && to === 'USD') {
    return amount * rates.KRW_TO_USD;
  } else if (from === 'USD' && to === 'EUR') {
    return amount * rates.USD_TO_EUR;
  } else if (from === 'EUR' && to === 'USD') {
    return amount * rates.EUR_TO_USD;
  } else if (from === 'KRW' && to === 'EUR') {
    return amount * rates.KRW_TO_EUR;
  } else if (from === 'EUR' && to === 'KRW') {
    return amount * rates.EUR_TO_KRW;
  }

  return amount;
}

export function getExchangeRateKey(from: string, to: string): string {
  return `${from}_TO_${to}`;
}
