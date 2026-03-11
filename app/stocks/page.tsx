'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { StockHolding, DashboardState } from '@/types';
import { getDashboardState, getStockHoldings, setStockHoldings, syncFromFirebase } from '@/lib/store';
import { getMarketIndices, getStockQuotes, getStockPrice } from '@/lib/stockApi';
import { getExchangeRates } from '@/lib/exchangeRate';
import { useAuth } from '@/hooks/useAuth';

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export default function StocksPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [marketIndices, setMarketIndices] = useState<Record<string, StockQuote>>({});
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  // RSU/옵션 탭 제거 (별도 페이지로 분리)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const getInitialFormData = useCallback(() => ({
    symbol: '',
    name: '',
    quantity: '',
    purchasePrice: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    currency: 'KRW',
    exchange: 'KRX' as 'KRX' | 'NASDAQ' | 'NYSE' | 'other',
    type: 'stock' as 'stock' | 'rsu' | 'option',
  }), []);
  
  const [formData, setFormData] = useState(getInitialFormData());

  useEffect(() => {
    if (isAuthenticated !== true) return;
    
    // Firebase에서 데이터 동기화 후 로컬 데이터 로드
    const loadData = async () => {
      await syncFromFirebase();
      
      const dashboardState = getDashboardState();
      setState(dashboardState);
      setHoldings(getStockHoldings());
      
      // 환율 로드
      getExchangeRates().then((rates) => {
        setExchangeRates(rates);
      });
    };
    
    loadData();
  }, [isAuthenticated]);

  // DashboardState 변경 감지 (TopBar에서 변경 시)
  useEffect(() => {
    const handleStateChange = () => {
      const newState = getDashboardState();
      setState(newState);
    };

    // 커스텀 이벤트 리스너 (같은 페이지)
    window.addEventListener('dashboardStateChanged', handleStateChange);
    // storage 이벤트 리스너 (다른 탭/페이지)
    window.addEventListener('storage', handleStateChange);

    return () => {
      window.removeEventListener('dashboardStateChanged', handleStateChange);
      window.removeEventListener('storage', handleStateChange);
    };
  }, []);

  // 시장 지수 주기적으로 업데이트 (1분마다)
  useEffect(() => {
    const loadIndices = (forceRefresh: boolean = false) => {
      getMarketIndices(forceRefresh).then((indices) => {
        setMarketIndices(indices);
      }).catch(() => {
        // 에러 발생 시 무시
      });
    };
    
    // 초기 로드 (강제 새로고침)
    loadIndices(true);
    
    // 1분마다 업데이트
    const interval = setInterval(() => loadIndices(false), 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const handleRefreshIndices = () => {
    getMarketIndices(true).then((indices) => {
      setMarketIndices(indices);
    }).catch(() => {
      // 에러 발생 시 무시
    });
  };

  // 주식 가격 업데이트
  useEffect(() => {
    if (holdings.length > 0 && exchangeRates) {
      const symbols = holdings.map((h) => h.symbol);
      getStockQuotes(symbols).then(async (quotes) => {
        const updated = holdings.map((holding) => {
          const quote = quotes[holding.symbol];
          if (quote) {
            return { ...holding, currentPrice: quote.price };
          }
          return holding;
        });
        setHoldings(updated);
        await setStockHoldings(updated);
      });
    }
  }, [holdings.length, exchangeRates]);

  const filteredHoldings = useMemo(() => {
    if (!state) return [];
    // 일반 주식만 필터링 (RSU/옵션은 별도 페이지로 분리)
    let filtered = holdings.filter((h) => !h.type || h.type === 'stock');
    
    // 소유자 필터링
    if (state.scope === 'combined') return filtered;
    return filtered.filter((holding) => holding.owner === state.scope || holding.owner === 'joint');
  }, [holdings, state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentUser: 'husband' | 'wife' = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];

    // 현재 가격 가져오기
    let currentPrice: number | undefined = undefined;
    if (formData.symbol) {
      try {
        const price = await getStockPrice(formData.symbol);
        if (price !== null) {
          currentPrice = price;
        }
      } catch (error) {
        // 에러 발생 시 기본값 유지
      }
    }

    if (editingId) {
      // 수정 - 전체 주식 목록에서 찾기
      const allHoldings = getStockHoldings();
      const existingHolding = allHoldings.find(holding => holding.id === editingId);
      if (!existingHolding) {
        console.error('Stock holding not found:', editingId);
        return;
      }
      
      const updatedHolding = {
        ...existingHolding,
        ...formData,
        quantity: Number(formData.quantity),
        purchasePrice: Number(formData.purchasePrice),
        currentPrice: currentPrice !== undefined ? currentPrice : existingHolding.currentPrice,
        as_of_date: today,
        last_modified_by: currentUser,
      };
      
      const updatedAllHoldings = allHoldings.map((holding) =>
        holding.id === editingId ? updatedHolding : holding
      );
      const stockHoldings = updatedAllHoldings.filter((h) => !h.type || h.type === 'stock');
      setHoldings(stockHoldings);
      setEditingId(null);
      await setStockHoldings(updatedAllHoldings);
    } else {
      const newHolding: StockHolding = {
        id: `stock-${Date.now()}`,
        ...formData,
        quantity: Number(formData.quantity),
        purchasePrice: Number(formData.purchasePrice),
        currentPrice,
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
      };
      const allHoldings = getStockHoldings();
      const updatedAllHoldings = [...allHoldings, newHolding];
      const stockHoldings = updatedAllHoldings.filter((h) => !h.type || h.type === 'stock');
      setHoldings(stockHoldings);
      await setStockHoldings(updatedAllHoldings);
    }

    // 폼 초기화
    setFormData(getInitialFormData());
    setIsFormOpen(false);
  };

  const handleEdit = (holding: StockHolding) => {
    // RSU/옵션은 편집하지 않음 (별도 페이지로 분리)
    if (holding.type === 'rsu' || holding.type === 'option') {
      return;
    }
    setFormData({
      symbol: holding.symbol,
      name: holding.name,
      quantity: String(holding.quantity),
      purchasePrice: String(holding.purchasePrice),
      owner: holding.owner,
      currency: holding.currency,
      exchange: holding.exchange,
      type: 'stock',
    });
    setEditingId(holding.id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const allHoldings = getStockHoldings();
    const updatedAllHoldings = allHoldings.filter((holding) => holding.id !== id);
    const stockHoldings = updatedAllHoldings.filter((h) => !h.type || h.type === 'stock');
    setHoldings(stockHoldings);
    await setStockHoldings(updatedAllHoldings);
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(getInitialFormData());
  };

  const totalValue = useMemo(() => {
    if (!exchangeRates) return 0;
    return Math.floor(filteredHoldings.reduce((sum, holding) => {
      const currentPrice = holding.currentPrice || holding.purchasePrice;
      const value = currentPrice * holding.quantity;
      
      let convertedValue = value;
      if (holding.currency === 'USD' && exchangeRates) {
        convertedValue = value * exchangeRates.USD_TO_KRW;
      } else if (holding.currency === 'EUR' && exchangeRates) {
        convertedValue = value * exchangeRates.EUR_TO_KRW;
      }
      
      return sum + convertedValue;
    }, 0));
  }, [filteredHoldings, exchangeRates]);

  const totalGainLoss = useMemo(() => {
    if (!exchangeRates) return { krw: 0, usd: 0, eur: 0 };
    
    const totals = filteredHoldings.reduce((acc, holding) => {
      const currentPrice = holding.currentPrice || holding.purchasePrice;
      const currency = holding.currency || 'KRW';
      const exchange = holding.exchange || 'KRX';
      const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
      const isEUR = currency === 'EUR';
      
      // 일반 주식만 처리 (RSU/옵션은 별도 페이지)
      const purchaseValue = holding.purchasePrice * holding.quantity;
      const currentValue = currentPrice * holding.quantity;
      const gainLossOriginal = currentValue - purchaseValue;
      
      if (isUSD) {
        acc.usd += gainLossOriginal;
        acc.krw += gainLossOriginal * exchangeRates.USD_TO_KRW;
      } else if (isEUR) {
        acc.eur += gainLossOriginal;
        acc.krw += gainLossOriginal * exchangeRates.EUR_TO_KRW;
      } else {
        acc.krw += gainLossOriginal;
      }
      
      return acc;
    }, { krw: 0, usd: 0, eur: 0 });
    
    return {
      krw: Math.floor(totals.krw),
      usd: totals.usd,
      eur: totals.eur,
    };
  }, [filteredHoldings, exchangeRates]);

  const holdingColumns: Column<StockHolding>[] = useMemo(() => [
    { key: 'symbol', label: '심볼', sortable: true },
    { key: 'name', label: '주식명', sortable: true },
    {
      key: 'quantity',
      label: '수량',
      sortable: true,
      render: (value) => new Intl.NumberFormat('ko-KR').format(value) + '주',
    },
    {
      key: 'purchasePrice',
      label: '매수 가격',
      sortable: true,
      render: (value, row) => {
        const currency = row.currency || 'KRW';
        if (currency === 'USD') {
          return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
        } else if (currency === 'EUR') {
          return `€${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
        } else {
          return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
        }
      },
    },
    {
      key: 'currentPrice',
      label: '현재 가격',
      sortable: true,
      render: (value, row) => {
        if (!value) return '-';
        const currency = row.currency || 'KRW';
        const exchange = row.exchange || 'KRX';
        
        // NASDAQ이나 NYSE는 USD로 처리
        const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
        const isEUR = currency === 'EUR';
        
        if (isUSD && exchangeRates) {
          const krwPrice = value * exchangeRates.USD_TO_KRW;
          return (
            <div>
              <div className="font-semibold">
                {new Intl.NumberFormat('ko-KR').format(Math.floor(krwPrice))}원
              </div>
              <div className="text-xs text-gray-500">
                (${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)})
              </div>
            </div>
          );
        } else if (isEUR && exchangeRates) {
          const krwPrice = value * exchangeRates.EUR_TO_KRW;
          return (
            <div>
              <div className="font-semibold">
                {new Intl.NumberFormat('ko-KR').format(Math.floor(krwPrice))}원
              </div>
              <div className="text-xs text-gray-500">
                (€{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)})
              </div>
            </div>
          );
        } else {
          return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
        }
      },
    },
    {
      key: 'value',
      label: '평가 금액',
      sortable: false,
      render: (_, row) => {
        if (!exchangeRates) return '-';
        const currentPrice = row.currentPrice || row.purchasePrice;
        const currency = row.currency || 'KRW';
        const exchange = row.exchange || 'KRX';
        
        // NASDAQ이나 NYSE는 USD로 처리
        const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
        const isEUR = currency === 'EUR';
        
        // 일반 주식만 처리 (RSU/옵션은 별도 페이지)
        let krwValue = currentPrice * row.quantity;
        const originalValue = currentPrice * row.quantity;
        
        if (isUSD) {
          krwValue = originalValue * exchangeRates.USD_TO_KRW;
          return (
            <div>
              <div className="font-semibold">
                {new Intl.NumberFormat('ko-KR').format(Math.floor(krwValue))}원
              </div>
              <div className="text-xs text-gray-500">
                (${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(originalValue)})
              </div>
            </div>
          );
        } else if (isEUR) {
          krwValue = originalValue * exchangeRates.EUR_TO_KRW;
          return (
            <div>
              <div className="font-semibold">
                {new Intl.NumberFormat('ko-KR').format(Math.floor(krwValue))}원
              </div>
              <div className="text-xs text-gray-500">
                (€{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(originalValue)})
              </div>
            </div>
          );
        } else {
          return `${new Intl.NumberFormat('ko-KR').format(Math.floor(krwValue))}원`;
        }
      },
    },
    {
      key: 'gainLoss',
      label: '손익',
      sortable: false,
      render: (_, row) => {
        if (!exchangeRates) return '-';
        
        const currentPrice = row.currentPrice || row.purchasePrice;
        const currency = row.currency || 'KRW';
        const exchange = row.exchange || 'KRX';
        const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
        const isEUR = currency === 'EUR';
        
        // 일반 주식만 처리 (RSU/옵션은 별도 페이지)
        const purchaseValue = row.purchasePrice * row.quantity;
        const currentValue = currentPrice * row.quantity;
        
        const gainLossOriginal = currentValue - purchaseValue;
        
        if (!exchangeRates) return '-';
        
        // 원화로 변환한 손익
        let gainLossKRW = gainLossOriginal;
        if (isUSD && exchangeRates) {
          gainLossKRW = gainLossOriginal * exchangeRates.USD_TO_KRW;
        } else if (isEUR && exchangeRates) {
          gainLossKRW = gainLossOriginal * exchangeRates.EUR_TO_KRW;
        }
        
        // 수익률 계산
        let percent = 0;
        if (purchaseValue > 0) {
          percent = ((currentValue - purchaseValue) / purchaseValue) * 100;
        } else if (purchaseValue === 0 && currentValue > 0) {
          percent = Infinity;
        }
        
        return (
          <div>
            {isUSD ? (
              <>
                <div className={`font-semibold ${gainLossKRW >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {gainLossKRW >= 0 ? '+' : ''}
                  {new Intl.NumberFormat('ko-KR').format(Math.floor(gainLossKRW))}원
                </div>
                <div className={`text-xs text-gray-500`}>
                  (${gainLossOriginal >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(gainLossOriginal)})
                </div>
                <div className={`text-xs ${gainLossOriginal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ({percent === Infinity ? '+' : percent >= 0 ? '+' : ''}{percent === Infinity ? '∞' : percent.toFixed(2)}%)
                </div>
              </>
            ) : isEUR ? (
              <>
                <div className={`font-semibold ${gainLossKRW >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {gainLossKRW >= 0 ? '+' : ''}
                  {new Intl.NumberFormat('ko-KR').format(Math.floor(gainLossKRW))}원
                </div>
                <div className={`text-xs text-gray-500`}>
                  (€{gainLossOriginal >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(gainLossOriginal)})
                </div>
                <div className={`text-xs ${gainLossOriginal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ({percent === Infinity ? '+' : percent >= 0 ? '+' : ''}{percent === Infinity ? '∞' : percent.toFixed(2)}%)
                </div>
              </>
            ) : (
              <>
                <div className={`font-semibold ${gainLossKRW >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {gainLossKRW >= 0 ? '+' : ''}
                  {new Intl.NumberFormat('ko-KR').format(Math.floor(gainLossKRW))}원
                </div>
                <div className={`text-xs ${gainLossKRW >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ({percent === Infinity ? '+' : percent >= 0 ? '+' : ''}{percent === Infinity ? '∞' : percent.toFixed(2)}%)
                </div>
              </>
            )}
          </div>
        );
      },
    },
    {
      key: 'owner',
      label: '소유자',
      sortable: true,
      render: (value) => {
        const labels: Record<string, string> = {
          husband: '남편',
          wife: '아내',
          joint: '공동',
        };
        return labels[value] || value;
      },
    },
    {
      key: 'actions',
      label: '작업',
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleEdit(row)}
            className="px-3 py-1 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
          >
            수정
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 transition-colors"
          >
            삭제
          </button>
        </div>
      ),
    },
  ], [exchangeRates]);

  if (isAuthenticated !== true) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <Navigation />
        <div className="p-6">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      <Navigation />
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">주식</h1>
            <div className="flex gap-2">
              <button
                onClick={handleRefreshIndices}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                지수 새로고침
              </button>
              <button
                onClick={() => {
                  setFormData(getInitialFormData());
                  setIsFormOpen(true);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                + 주식 추가
              </button>
            </div>
          </div>

          {/* 시장 지수 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            {Object.values(marketIndices).map((index) => {
              const isPositive = index.change >= 0;
              return (
                <div
                  key={index.symbol}
                  className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                >
                  <div className="text-sm text-gray-600 mb-1">{index.name}</div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(index.price)}
                  </div>
                  <div className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                      {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}
                      {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(index.change))}
                    </span>
                    <span className={`ml-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      ({isPositive ? '+' : ''}{index.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">총 평가 금액</div>
              <div className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('ko-KR').format(totalValue)}원
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">총 손익</div>
              {totalGainLoss.usd !== 0 ? (
                <div>
                  <div className={`text-2xl font-bold ${totalGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {totalGainLoss.krw >= 0 ? '+' : ''}
                    {new Intl.NumberFormat('ko-KR').format(totalGainLoss.krw)}원
                  </div>
                  <div className={`text-sm text-gray-500 ${totalGainLoss.usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    (${totalGainLoss.usd >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalGainLoss.usd)})
                  </div>
                </div>
              ) : totalGainLoss.eur !== 0 ? (
                <div>
                  <div className={`text-2xl font-bold ${totalGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {totalGainLoss.krw >= 0 ? '+' : ''}
                    {new Intl.NumberFormat('ko-KR').format(totalGainLoss.krw)}원
                  </div>
                  <div className={`text-sm text-gray-500 ${totalGainLoss.eur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    (€{totalGainLoss.eur >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalGainLoss.eur)})
                  </div>
                </div>
              ) : (
                <div className={`text-2xl font-bold ${totalGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalGainLoss.krw >= 0 ? '+' : ''}
                  {new Intl.NumberFormat('ko-KR').format(totalGainLoss.krw)}원
                </div>
              )}
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">보유 종목 수</div>
              <div className="text-2xl font-bold text-gray-900">{filteredHoldings.length}개</div>
            </div>
          </div>

          {/* 입력 폼 모달 */}
          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {editingId ? '주식 수정' : '주식 추가'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      심볼 *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.symbol}
                      onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="예: 005930, AAPL"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      주식명 *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="예: 삼성전자, Apple Inc."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        수량 *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        매수 가격 *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        소유자 *
                      </label>
                      <select
                        required
                        value={formData.owner}
                        onChange={(e) =>
                          setFormData({ ...formData, owner: e.target.value as any })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="husband">남편</option>
                        <option value="wife">아내</option>
                        <option value="joint">공동</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        거래소 *
                      </label>
                      <select
                        required
                        value={formData.exchange}
                        onChange={(e) =>
                          setFormData({ ...formData, exchange: e.target.value as any })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="KRX">KRX (한국)</option>
                        <option value="NASDAQ">NASDAQ (미국)</option>
                        <option value="NYSE">NYSE (미국)</option>
                        <option value="other">기타</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      통화
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="KRW">KRW (원)</option>
                      <option value="USD">USD (달러)</option>
                      <option value="EUR">EUR (유로)</option>
                    </select>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      {editingId ? '수정' : '추가'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 주식 목록 테이블 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">내 주식 목록</h2>
            </div>
            <Table data={filteredHoldings} columns={holdingColumns} searchable />
          </div>
        </div>
      </div>
    </div>
  );
}
