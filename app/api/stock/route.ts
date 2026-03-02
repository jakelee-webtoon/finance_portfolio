import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch stock data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result?.meta) {
      return NextResponse.json(
        { error: 'Invalid data format' },
        { status: 500 }
      );
    }

    const meta = result.meta;
    
    // 차트 데이터에서 가격 배열 가져오기
    const quotes = result.indicators?.quote?.[0];
    const timestamps = result.timestamp;
    
    let currentPrice = 0;
    let previousClose = 0;
    let change = 0;
    let changePercent = 0;
    
    // 차트 데이터에서 직접 계산 (가장 정확)
    if (quotes?.close && quotes.close.length >= 2 && timestamps && timestamps.length >= 2) {
      // 마지막 가격 (오늘)
      const latestIndex = quotes.close.length - 1;
      currentPrice = quotes.close[latestIndex];
      
      // 전일 가격 찾기 (전날의 마지막 가격)
      let prevIndex = latestIndex - 1;
      while (prevIndex >= 0 && quotes.close[prevIndex] === null) {
        prevIndex--;
      }
      
      if (prevIndex >= 0) {
        previousClose = quotes.close[prevIndex];
      } else {
        // 전일 데이터가 없으면 메타의 previousClose 사용
        previousClose = meta.previousClose || meta.chartPreviousClose || currentPrice;
      }
      
      change = currentPrice - previousClose;
      changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
    } else {
      // 차트 데이터가 없으면 메타 데이터 사용
      currentPrice = meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose || 0;
      previousClose = meta.previousClose || meta.chartPreviousClose || currentPrice;
      
      // API에서 제공하는 변동 데이터 우선 사용
      if (meta.regularMarketChange !== undefined && meta.regularMarketChange !== null) {
        change = meta.regularMarketChange;
      } else {
        change = currentPrice - previousClose;
      }
      
      if (meta.regularMarketChangePercent !== undefined && meta.regularMarketChangePercent !== null) {
        changePercent = meta.regularMarketChangePercent;
      } else {
        changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
      }
    }

    return NextResponse.json({
      symbol,
      name: meta.shortName || symbol,
      price: currentPrice,
      change: change || 0,
      changePercent: changePercent || 0,
      previousClose: previousClose,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
