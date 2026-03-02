// 주가 API 관련 유틸리티

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

const STOCK_CACHE_KEY = 'stock-quotes-cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5분

interface StockCache {
  quotes: Record<string, StockQuote>;
  timestamp: number;
}

// 무료 주가 API 사용
// Yahoo Finance API (비공식, 무료)
// 또는 Alpha Vantage (API 키 필요)

async function fetchStockPriceFromYahoo(symbol: string): Promise<number | null> {
  try {
    // 한국 주식인 경우 (6자리 숫자)
    let yahooSymbol = symbol;
    if (/^\d{6}$/.test(symbol)) {
      // 코스피는 .KS, 코스닥은 .KQ (일단 .KS로 시도)
      yahooSymbol = `${symbol}.KS`;
    }
    
    // Next.js API Route를 통해 프록시 호출
    let response = await fetch(`/api/stock?symbol=${encodeURIComponent(yahooSymbol)}`);
    
    if (!response.ok) {
      // 코스닥 시도
      if (/^\d{6}$/.test(symbol)) {
        yahooSymbol = `${symbol}.KQ`;
        response = await fetch(`/api/stock?symbol=${encodeURIComponent(yahooSymbol)}`);
        if (!response.ok) {
          return null;
        }
      } else {
        return null;
      }
    }
    
    const data = await response.json();
    
    if (data.error) {
      return null;
    }
    
    return data.price || null;
  } catch (error) {
    return null;
  }
}

export async function getStockPrice(symbol: string): Promise<number | null> {
  // 캐시 확인
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(`${STOCK_CACHE_KEY}-${symbol}`);
    if (cached) {
      try {
        const cache: { price: number; timestamp: number } = JSON.parse(cached);
        const now = Date.now();
        if (now - cache.timestamp < CACHE_DURATION) {
          return cache.price;
        }
      } catch (e) {
        // 캐시 파싱 실패 시 무시
      }
    }
  }

  try {
    const price = await fetchStockPriceFromYahoo(symbol);
    
    if (price !== null) {
      // 캐시 저장
      if (typeof window !== 'undefined') {
        const cache = {
          price,
          timestamp: Date.now(),
        };
        localStorage.setItem(`${STOCK_CACHE_KEY}-${symbol}`, JSON.stringify(cache));
      }
      return price;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

export async function getStockQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  // 캐시 확인
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(STOCK_CACHE_KEY);
    if (cached) {
      try {
        const cache: StockCache = JSON.parse(cached);
        const now = Date.now();
        if (now - cache.timestamp < CACHE_DURATION) {
          return cache.quotes;
        }
      } catch (e) {
        // 캐시 파싱 실패 시 무시
      }
    }
  }

  try {
    // 시장 지수는 mock 데이터 사용
    const quotes: Record<string, StockQuote> = {
      '^IXIC': { // 나스닥
        symbol: '^IXIC',
        name: '나스닥',
        price: 15000,
        change: 120,
        changePercent: 0.81,
      },
      '^KS11': { // 코스피
        symbol: '^KS11',
        name: '코스피',
        price: 2650,
        change: -15,
        changePercent: -0.56,
      },
      '^KQ11': { // 코스닥
        symbol: '^KQ11',
        name: '코스닥',
        price: 850,
        change: 8,
        changePercent: 0.95,
      },
    };

    // 개별 주식 가격 가져오기
    for (const symbol of symbols) {
      if (!symbol.startsWith('^')) {
        // 시장 지수가 아닌 경우
        const price = await getStockPrice(symbol);
        if (price !== null) {
          quotes[symbol] = {
            symbol,
            name: symbol, // 이름은 별도로 관리
            price,
            change: 0, // 변동 정보는 별도 API 필요
            changePercent: 0,
          };
        }
      }
    }

    // 캐시 저장
    if (typeof window !== 'undefined') {
      const cache: StockCache = {
        quotes,
        timestamp: Date.now(),
      };
      localStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(cache));
    }

    return quotes;
  } catch (error) {
    // 기본값 반환
    return {
      '^IXIC': {
        symbol: '^IXIC',
        name: '나스닥',
        price: 15000,
        change: 0,
        changePercent: 0,
      },
      '^KS11': {
        symbol: '^KS11',
        name: '코스피',
        price: 2650,
        change: 0,
        changePercent: 0,
      },
      '^KQ11': {
        symbol: '^KQ11',
        name: '코스닥',
        price: 850,
        change: 0,
        changePercent: 0,
      },
    };
  }
}

async function fetchIndexQuote(symbol: string, name: string): Promise<StockQuote | null> {
  try {
    // Next.js API Route를 통해 프록시 호출
    const response = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.error) {
      return null;
    }
    
    return {
      symbol: data.symbol,
      name: name, // API에서 가져온 이름 대신 전달받은 이름 사용
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
    };
  } catch (error) {
    return null;
  }
}

export async function getMarketIndices(forceRefresh: boolean = false): Promise<Record<string, StockQuote>> {
  // 캐시 확인 (강제 새로고침이 아닐 때만)
  if (!forceRefresh && typeof window !== 'undefined') {
    const cached = localStorage.getItem(`${STOCK_CACHE_KEY}-indices`);
    if (cached) {
      try {
        const cache: StockCache = JSON.parse(cached);
        const now = Date.now();
        if (now - cache.timestamp < CACHE_DURATION) {
          return cache.quotes;
        }
      } catch (e) {
        // 캐시 파싱 실패 시 무시
      }
    }
  }

  try {
    // 나스닥, 코스피, 코스닥 지수 가져오기
    const [nasdaq, kospi, kosdaq] = await Promise.all([
      fetchIndexQuote('^IXIC', 'NASDAQ'),
      fetchIndexQuote('^KS11', 'KOSPI'),
      fetchIndexQuote('^KQ11', 'Kosdaq'),
    ]);

    const quotes: Record<string, StockQuote> = {};
    
    if (nasdaq) {
      quotes['^IXIC'] = nasdaq;
    } else {
      // Fallback
      quotes['^IXIC'] = {
        symbol: '^IXIC',
        name: 'NASDAQ',
        price: 15000,
        change: 0,
        changePercent: 0,
      };
    }
    
    if (kospi) {
      quotes['^KS11'] = kospi;
    } else {
      // Fallback
      quotes['^KS11'] = {
        symbol: '^KS11',
        name: 'KOSPI',
        price: 2650,
        change: 0,
        changePercent: 0,
      };
    }
    
    if (kosdaq) {
      quotes['^KQ11'] = kosdaq;
    } else {
      // Fallback
      quotes['^KQ11'] = {
        symbol: '^KQ11',
        name: 'Kosdaq',
        price: 850,
        change: 0,
        changePercent: 0,
      };
    }

    // 캐시 저장
    if (typeof window !== 'undefined') {
      const cache: StockCache = {
        quotes,
        timestamp: Date.now(),
      };
      localStorage.setItem(`${STOCK_CACHE_KEY}-indices`, JSON.stringify(cache));
    }

    return quotes;
  } catch (error) {
    // Fallback 데이터 반환
    return {
      '^IXIC': {
        symbol: '^IXIC',
        name: 'NASDAQ',
        price: 15000,
        change: 0,
        changePercent: 0,
      },
      '^KS11': {
        symbol: '^KS11',
        name: 'KOSPI',
        price: 2650,
        change: 0,
        changePercent: 0,
      },
      '^KQ11': {
        symbol: '^KQ11',
        name: 'Kosdaq',
        price: 850,
        change: 0,
        changePercent: 0,
      },
    };
  }
}
