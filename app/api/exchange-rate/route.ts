import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FALLBACK_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

function buildRates(usdToKrw: number, usdToEur: number = 0.92): Record<string, number> {
  return {
    USD: 1,
    KRW: usdToKrw,
    EUR: usdToEur,
    USD_TO_KRW: usdToKrw,
    KRW_TO_USD: 1 / usdToKrw,
    USD_TO_EUR: usdToEur,
    EUR_TO_USD: 1 / usdToEur,
    KRW_TO_EUR: usdToEur / usdToKrw,
    EUR_TO_KRW: usdToKrw / usdToEur,
  };
}

async function fetchUsdKrwFromYahoo(): Promise<number | null> {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/USDKRW=X?interval=1m&range=1d&_t=${Date.now()}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const result = data.chart?.result?.[0];
  const metaPrice = result?.meta?.regularMarketPrice;
  const closePrices = result?.indicators?.quote?.[0]?.close;

  const latestClose = Array.isArray(closePrices)
    ? [...closePrices].reverse().find((price) => typeof price === 'number' && price > 0)
    : null;

  const price = typeof metaPrice === 'number' && metaPrice > 0 ? metaPrice : latestClose;
  return typeof price === 'number' && price > 0 ? price : null;
}

async function fetchFallbackRates(): Promise<Record<string, number> | null> {
  const response = await fetch(`${FALLBACK_API_URL}?_t=${Date.now()}`, {
    cache: 'no-store',
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const usdToKrw = Number(data.rates?.KRW);
  const usdToEur = Number(data.rates?.EUR);

  if (!Number.isFinite(usdToKrw) || usdToKrw <= 0) {
    return null;
  }

  return buildRates(usdToKrw, Number.isFinite(usdToEur) && usdToEur > 0 ? usdToEur : 0.92);
}

export async function GET() {
  try {
    const yahooUsdToKrw = await fetchUsdKrwFromYahoo();

    if (yahooUsdToKrw) {
      return NextResponse.json(buildRates(yahooUsdToKrw), {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    const fallbackRates = await fetchFallbackRates();

    if (fallbackRates) {
      return NextResponse.json(fallbackRates, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    return NextResponse.json(buildRates(1300), { status: 502 });
  } catch (error) {
    return NextResponse.json(buildRates(1300), { status: 500 });
  }
}
