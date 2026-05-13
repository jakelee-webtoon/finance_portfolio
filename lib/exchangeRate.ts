// 환율 API 관련 유틸리티

const EXCHANGE_RATE_CACHE_KEY = 'exchange-rate-cache';
const CACHE_VERSION = 2;
const CACHE_DURATION = 1 * 60 * 1000; // 1분

interface ExchangeRateCache {
  rates: Record<string, number>;
  timestamp: number;
  version?: number;
}

function getFallbackRates(): Record<string, number> {
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

export async function getExchangeRates(): Promise<Record<string, number>> {
  // 캐시 확인
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(EXCHANGE_RATE_CACHE_KEY);
    if (cached) {
      try {
        const cache: ExchangeRateCache = JSON.parse(cached);
        const now = Date.now();
        // 캐시가 1분 이내면 사용
        if (cache.version === CACHE_VERSION && now - cache.timestamp < CACHE_DURATION) {
          return cache.rates;
        }
      } catch (e) {
        // 캐시 파싱 실패 시 무시
      }
    }
  }

  try {
    const response = await fetch(`/api/exchange-rate?_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rates');
    }
    const rates = await response.json();

    // 캐시 저장
    if (typeof window !== 'undefined') {
      const cache: ExchangeRateCache = {
        rates,
        timestamp: Date.now(),
        version: CACHE_VERSION,
      };
      localStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify(cache));
    }

    return rates;
  } catch (error) {
    // 기본 환율 반환 (오프라인 또는 API 실패 시)
    return getFallbackRates();
  }
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
