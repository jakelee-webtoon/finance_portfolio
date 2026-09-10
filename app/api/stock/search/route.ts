import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type YahooQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
  exchange?: string;
};

function normalizeSymbol(symbol: string) {
  return symbol.replace(/\.(KS|KQ)$/i, '');
}

function detectExchange(symbol: string, exchange?: string, exchDisp?: string): 'KRX' | 'NASDAQ' | 'NYSE' | 'other' {
  if (/\.(KS|KQ)$/i.test(symbol) || exchange === 'KSC' || exchDisp === 'Korea') return 'KRX';
  if (exchange === 'NMS' || exchDisp === 'NASDAQ') return 'NASDAQ';
  if (exchange === 'NYQ' || exchDisp === 'NYSE') return 'NYSE';
  return 'other';
}

function detectCurrency(exchange: 'KRX' | 'NASDAQ' | 'NYSE' | 'other') {
  return exchange === 'KRX' ? 'KRW' : 'USD';
}

async function fetchPrice(symbol: string): Promise<number | undefined> {
  try {
    const timestamp = Date.now();
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&_t=${timestamp}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) return undefined;
    const data = await response.json();
    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice || meta?.previousClose || meta?.chartPreviousClose;
    return typeof price === 'number' && Number.isFinite(price) ? price : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to search stock data' }, { status: response.status });
    }

    const data = await response.json();
    const quotes: YahooQuote[] = Array.isArray(data.quotes) ? data.quotes : [];
    const results = await Promise.all(
      quotes
        .filter((quote) => {
          const symbol = quote.symbol || '';
          const name = quote.longname || quote.shortname || '';
          const exchange = detectExchange(symbol, quote.exchange, quote.exchDisp);
          const isEtf = quote.quoteType === 'ETF' || /ETF|TIGER|KODEX|ACE|SOL|KBSTAR|HANARO/i.test(name);
          return symbol && name && isEtf && exchange === 'KRX';
        })
        .slice(0, 6)
        .map(async (quote) => {
          const yahooSymbol = quote.symbol as string;
          const exchange = detectExchange(yahooSymbol, quote.exchange, quote.exchDisp);
          return {
            symbol: normalizeSymbol(yahooSymbol),
            yahooSymbol,
            name: quote.longname || quote.shortname || yahooSymbol,
            exchange,
            currency: detectCurrency(exchange),
            price: await fetchPrice(yahooSymbol),
          };
        })
    );

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
