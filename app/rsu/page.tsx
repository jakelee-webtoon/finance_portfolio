'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { StockHolding, DashboardState, Asset } from '@/types';
import { getDashboardState, getStockHoldings, setStockHoldings, getAssets, setAssets, syncFromFirebase } from '@/lib/store';
import { getStockPrice, detectExchangeAndCurrency } from '@/lib/stockApi';
import { getExchangeRates } from '@/lib/exchangeRate';
import { useAuth } from '@/hooks/useAuth';

export default function RSUPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // 최신 holdings 참조를 위한 ref
  const holdingsRef = useRef<StockHolding[]>([]);
  
  const getInitialFormData = useCallback(() => ({
    symbol: '',
    name: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    currency: 'KRW',
    exchange: 'KRX' as 'KRX' | 'NASDAQ' | 'NYSE' | 'other',
    type: 'rsu' as 'stock' | 'rsu' | 'option',
    totalQuantity: '',
    vestingDate: '',
    strikePrice: '',
    expiryDate: '',
  }), []);
  
  const [formData, setFormData] = useState(getInitialFormData());

  useEffect(() => {
    if (isAuthenticated !== true) return;
    
    // Firebase에서 데이터 동기화 후 로컬 데이터 로드
    const loadData = async () => {
      await syncFromFirebase();
      
      const dashboardState = getDashboardState();
      setState(dashboardState);
      const allHoldings = getStockHoldings();
      // RSU와 옵션만 필터링
      const filtered = allHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
      setHoldings(filtered);
      holdingsRef.current = filtered;
      
      // 환율 로드
      getExchangeRates().then((rates) => {
        setExchangeRates(rates);
      });
    };
    
    loadData();
  }, [isAuthenticated]);

  // holdings가 변경될 때마다 ref 업데이트
  useEffect(() => {
    holdingsRef.current = holdings;
  }, [holdings]);

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

  const filteredHoldings = useMemo(() => {
    if (!state) return [];
    let filtered = holdings.filter((h) => h.type === 'rsu' || h.type === 'option');
    
    if (state.scope === 'combined') return filtered;
    return filtered.filter((holding) => holding.owner === state.scope || holding.owner === 'joint');
  }, [holdings, state]);

  // RSU/옵션을 포트폴리오 자산으로 동기화 (주식명별로 그룹화)
  const syncHoldingsToAsset = useCallback(() => {
    // 최신 holdings 참조 사용
    const currentHoldings = holdingsRef.current;
    if (!exchangeRates || currentHoldings.length === 0) return;
    
    const assets = getAssets();
    const today = new Date().toISOString().split('T')[0];
    const currentUser: 'husband' | 'wife' = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    
    // RSU/옵션을 주식명별로 그룹화
    const groupedByStock = currentHoldings.reduce((acc, holding) => {
      const key = holding.name || holding.symbol;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(holding);
      return acc;
    }, {} as Record<string, StockHolding[]>);
    
    // 기존 RSU 자산 ID 목록 (나중에 삭제되지 않은 것들은 제거하기 위해)
    const rsuAssetIds = new Set<string>();
    
    // 각 주식별로 자산 생성/업데이트
    Object.entries(groupedByStock).forEach(([stockName, stockHoldings]) => {
      // 해당 주식의 총 평가 금액 계산
      let totalValueKRW = 0; // 원화로 변환된 총액
      let totalValueOriginal = 0; // 원래 통화의 총액
      let hasValidValue = false;
      let owner: 'husband' | 'wife' | 'joint' = 'joint';
      let currency = 'KRW';
      let exchange = 'KRX';
      
      stockHoldings.forEach((holding) => {
        const currentPrice = holding.currentPrice || 0;
        if (!currentPrice) return;
        
        let quantity = 0;
        let valueOriginal = 0; // 원래 통화의 가치
        
        if (holding.type === 'rsu' && holding.totalQuantity !== undefined) {
          quantity = holding.totalQuantity;
          valueOriginal = currentPrice * quantity;
        } else if (holding.type === 'option' && holding.strikePrice !== undefined) {
          const intrinsicValue = currentPrice - holding.strikePrice;
          if (intrinsicValue > 0) {
            quantity = holding.quantity;
            valueOriginal = intrinsicValue * quantity;
          } else {
            return; // 내재가치 없음
          }
        } else {
          quantity = holding.quantity;
          valueOriginal = currentPrice * quantity;
        }
        
        if (valueOriginal > 0) {
          hasValidValue = true;
          
          // 환율 변환
          const holdingCurrency = holding.currency || 'KRW';
          const holdingExchange = holding.exchange || 'KRX';
          const isUSD = holdingCurrency === 'USD' || holdingExchange === 'NASDAQ' || holdingExchange === 'NYSE';
          const isEUR = holdingCurrency === 'EUR';
          
          let valueKRW = valueOriginal;
          if (isUSD && exchangeRates) {
            valueKRW = valueOriginal * exchangeRates.USD_TO_KRW;
          } else if (isEUR && exchangeRates) {
            valueKRW = valueOriginal * exchangeRates.EUR_TO_KRW;
          }
          
          totalValueKRW += valueKRW;
          totalValueOriginal += valueOriginal;
          
          // 소유자와 통화는 첫 번째 유효한 holding의 값 사용
          if (owner === 'joint' && holding.owner) {
            owner = holding.owner;
          }
          // 통화는 원래 통화 사용 (KRW가 아닌 경우)
          if (currency === 'KRW' && holdingCurrency !== 'KRW') {
            currency = holdingCurrency;
            exchange = holdingExchange;
          } else if (currency === 'KRW' && (holdingExchange === 'NASDAQ' || holdingExchange === 'NYSE')) {
            currency = 'USD';
            exchange = holdingExchange;
          }
        }
      });
      
      if (!hasValidValue || totalValueKRW === 0) return;
      
      const assetId = `asset-rsu-${stockName}`;
      rsuAssetIds.add(assetId);
      
      // 기존 자산 찾기
      const existingAssetIndex = assets.findIndex((asset) => asset.id === assetId);
      
      if (existingAssetIndex >= 0) {
        // 기존 자산 업데이트
        assets[existingAssetIndex] = {
          ...assets[existingAssetIndex],
          name: 'RSU',
          amount: Math.floor(totalValueOriginal), // 원래 통화의 금액 저장 (포트폴리오 페이지가 환율 변환 처리)
          owner,
          currency, // 원래 통화 (USD, EUR 등) 저장
          as_of_date: today,
          last_modified_by: currentUser,
        };
      } else {
        // 새 자산 추가
        assets.push({
          id: assetId,
          name: 'RSU',
          category: 'stocks',
          amount: Math.floor(totalValueOriginal), // 원래 통화의 금액 저장 (포트폴리오 페이지가 환율 변환 처리)
          owner,
          currency, // 원래 통화 (USD, EUR 등) 저장
          source_type: 'manual',
          as_of_date: today,
          last_modified_by: currentUser,
        });
      }
    });
    
    // 기존 RSU 자산 중 더 이상 존재하지 않는 것들 제거
    const updatedAssets = assets.filter((asset) => {
      if (asset.id.startsWith('asset-rsu-')) {
        return rsuAssetIds.has(asset.id);
      }
      // RSU가 아닌 자산은 그대로 유지
      return true;
    });
    
    setAssets(updatedAssets);
  }, [exchangeRates, state]); // holdings 의존성 제거 (useRef로 최신 값 참조)

  // 현재 가격 주기적으로 업데이트
  useEffect(() => {
    // 최신 holdings 참조 사용
    const currentHoldings = holdingsRef.current;
    if (!exchangeRates || currentHoldings.length === 0) return;

    const updatePrices = async (forceRefresh: boolean = false) => {
      // 강제 새로고침인 경우 모든 심볼의 캐시 삭제
      if (forceRefresh && typeof window !== 'undefined') {
        currentHoldings.forEach((holding) => {
          if (holding.symbol) {
            localStorage.removeItem(`stock-quotes-cache-${holding.symbol}`);
          }
        });
      }
      
      const updated = await Promise.all(
        currentHoldings.map(async (holding) => {
          if (!holding.symbol) return holding;
          try {
            const price = await getStockPrice(holding.symbol, forceRefresh);
            if (price !== null && price !== holding.currentPrice) {
              return { ...holding, currentPrice: price };
            }
          } catch (error) {
            // 에러 발생 시 기존 holding 반환
          }
          return holding;
        })
      );
      
      // 실제로 변경된 것이 있는지 확인
      const hasChanges = updated.some((holding, index) => 
        holding.currentPrice !== currentHoldings[index]?.currentPrice
      );
      
      if (hasChanges) {
        setHoldings(updated);
        setStockHoldings(updated);
        
        // 가격 업데이트 후 자산도 동기화 (전체 재계산)
        setTimeout(() => {
          syncHoldingsToAsset();
        }, 100);
      }
    };

    // 초기 로드 시 강제 새로고침
    updatePrices(true);
    // 이후 1분마다 업데이트 (캐시 사용)
    const interval = setInterval(() => updatePrices(false), 60000);
    return () => clearInterval(interval);
  }, [exchangeRates, syncHoldingsToAsset]); // holdings.length 제거 (useRef로 최신 값 참조)

  // 초기 로드 시 기존 RSU/옵션을 자산으로 동기화
  useEffect(() => {
    // 최신 holdings 참조 사용
    const currentHoldings = holdingsRef.current;
    if (!exchangeRates || currentHoldings.length === 0) return;
    
    syncHoldingsToAsset();
  }, [exchangeRates, syncHoldingsToAsset]); // holdings 의존성 제거 (useRef로 최신 값 참조)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentUser: 'husband' | 'wife' = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];

    // 심볼로 거래소/통화 자동 감지
    let detectedExchange = formData.exchange;
    let detectedCurrency = formData.currency;
    if (formData.symbol) {
      const detected = detectExchangeAndCurrency(formData.symbol);
      // 사용자가 기본값(KRW/KRX)을 변경하지 않았다면 자동 감지 값 사용
      if (formData.currency === 'KRW' && formData.exchange === 'KRX') {
        detectedExchange = detected.exchange;
        detectedCurrency = detected.currency;
      }
    }

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
      const updated = holdings.map((holding) =>
        holding.id === editingId
          ? {
              ...holding,
              ...formData,
              exchange: detectedExchange,
              currency: detectedCurrency,
              quantity: holding.quantity || 0,
              purchasePrice: holding.purchasePrice || 0,
              currentPrice: currentPrice !== undefined ? currentPrice : holding.currentPrice,
              totalQuantity: formData.totalQuantity ? Number(formData.totalQuantity) : undefined,
              vestingDate: formData.vestingDate || undefined,
              strikePrice: formData.strikePrice ? Number(formData.strikePrice) : undefined,
              expiryDate: formData.expiryDate || undefined,
              as_of_date: today,
              last_modified_by: currentUser,
            }
          : holding
      );
      setHoldings(updated);
      setStockHoldings(updated);
      setEditingId(null);
      
      // 포트폴리오 자산도 동기화 (전체 재계산)
      // holdings 상태가 업데이트된 후 동기화하도록 다음 렌더 사이클에서 실행
      setTimeout(() => {
        syncHoldingsToAsset();
      }, 100);
    } else {
      const newHolding: StockHolding = {
        id: `stock-${Date.now()}`,
        ...formData,
        exchange: detectedExchange,
        currency: detectedCurrency,
        quantity: 0,
        purchasePrice: 0,
        currentPrice,
        totalQuantity: formData.totalQuantity ? Number(formData.totalQuantity) : undefined,
        vestingDate: formData.vestingDate || undefined,
        strikePrice: formData.strikePrice ? Number(formData.strikePrice) : undefined,
        expiryDate: formData.expiryDate || undefined,
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
      };
      const updated = [...holdings, newHolding];
      setHoldings(updated);
      setStockHoldings(updated);
      
      // 포트폴리오 자산도 동기화 (전체 재계산)
      // holdings 상태가 업데이트된 후 동기화하도록 다음 렌더 사이클에서 실행
      setTimeout(() => {
        syncHoldingsToAsset();
      }, 100);
    }

    setFormData(getInitialFormData());
    setIsFormOpen(false);
  };

  const handleEdit = (holding: StockHolding) => {
    setFormData({
      symbol: holding.symbol,
      name: holding.name,
      owner: holding.owner,
      currency: holding.currency,
      exchange: holding.exchange,
      type: holding.type || 'rsu',
      totalQuantity: holding.totalQuantity ? String(holding.totalQuantity) : '',
      vestingDate: holding.vestingDate || '',
      strikePrice: holding.strikePrice ? String(holding.strikePrice) : '',
      expiryDate: holding.expiryDate || '',
    });
    setEditingId(holding.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      const updated = holdings.filter((holding) => holding.id !== id);
      setHoldings(updated);
      setStockHoldings(updated);
      
      // 포트폴리오 자산도 동기화 (전체 재계산)
      // holdings 상태가 업데이트된 후 동기화하도록 다음 렌더 사이클에서 실행
      setTimeout(() => {
        syncHoldingsToAsset();
      }, 100);
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(getInitialFormData());
  };

  const totalValue = useMemo(() => {
    if (!exchangeRates) return 0;
    return Math.floor(filteredHoldings.reduce((sum, holding) => {
      const currentPrice = holding.currentPrice || 0;
      if (!currentPrice) return sum; // 현재 가격이 없으면 제외
      
      let quantity = 0;
      let value = 0;
      
      // RSU: 전체 수량 사용 (베스팅은 별도로 등록)
      if (holding.type === 'rsu' && holding.totalQuantity !== undefined) {
        quantity = holding.totalQuantity;
        value = currentPrice * quantity;
      } else if (holding.type === 'option' && holding.strikePrice !== undefined) {
        const intrinsicValue = currentPrice - holding.strikePrice;
        if (intrinsicValue > 0) {
          quantity = holding.quantity;
          value = intrinsicValue * quantity;
        } else {
          return sum; // 내재가치가 없으면 제외
        }
      } else {
        // 일반 주식 (혹시 모를 경우)
        quantity = holding.quantity;
        value = currentPrice * quantity;
      }
      
      // 환율 변환
      const currency = holding.currency || 'KRW';
      const exchange = holding.exchange || 'KRX';
      const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
      const isEUR = currency === 'EUR';
      
      if (isUSD && exchangeRates) {
        value = value * exchangeRates.USD_TO_KRW;
      } else if (isEUR && exchangeRates) {
        value = value * exchangeRates.EUR_TO_KRW;
      }
      
      return sum + value;
    }, 0));
  }, [filteredHoldings, exchangeRates]);

  // 실현 손익 계산 (vesting 완료된 것들)
  const realizedGainLoss = useMemo(() => {
    if (!exchangeRates) return { krw: 0, usd: 0, eur: 0 };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totals = filteredHoldings.reduce((acc, holding) => {
      // vesting 완료 여부 확인
      let isRealized = false;
      
      if (holding.type === 'rsu' && holding.vestingDate) {
        const vestingDate = new Date(holding.vestingDate);
        vestingDate.setHours(0, 0, 0, 0);
        isRealized = vestingDate <= today;
      } else if (holding.type === 'option' && holding.expiryDate) {
        const expiryDate = new Date(holding.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        isRealized = expiryDate <= today;
      }
      
      // 실현되지 않은 것은 제외
      if (!isRealized) return acc;
      
      const currentPrice = holding.currentPrice || 0;
      const currency = holding.currency || 'KRW';
      const exchange = holding.exchange || 'KRX';
      const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
      const isEUR = currency === 'EUR';
      
      let quantity = 0;
      let purchaseValue = 0;
      let currentValue = 0;
      
      // RSU: 전체 수량 사용
      if (holding.type === 'rsu' && holding.totalQuantity !== undefined) {
        quantity = holding.totalQuantity;
        purchaseValue = (holding.purchasePrice || 0) * quantity;
        currentValue = currentPrice * quantity;
      } else if (holding.type === 'option' && holding.strikePrice !== undefined) {
        const intrinsicValue = currentPrice - holding.strikePrice;
        if (intrinsicValue > 0) {
          quantity = holding.quantity;
          purchaseValue = holding.strikePrice * quantity;
          currentValue = intrinsicValue * quantity;
        }
      } else {
        quantity = holding.quantity;
        purchaseValue = (holding.purchasePrice || 0) * quantity;
        currentValue = currentPrice * quantity;
      }
      
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

  // 잔여 손익 계산 (vesting 미완료된 것들)
  const unrealizedGainLoss = useMemo(() => {
    if (!exchangeRates) return { krw: 0, usd: 0, eur: 0 };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const totals = filteredHoldings.reduce((acc, holding) => {
      // vesting 완료 여부 확인
      let isRealized = false;
      
      if (holding.type === 'rsu' && holding.vestingDate) {
        const vestingDate = new Date(holding.vestingDate);
        vestingDate.setHours(0, 0, 0, 0);
        isRealized = vestingDate <= today;
      } else if (holding.type === 'option' && holding.expiryDate) {
        const expiryDate = new Date(holding.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        isRealized = expiryDate <= today;
      }
      
      // 실현된 것은 제외
      if (isRealized) return acc;
      
      const currentPrice = holding.currentPrice || 0;
      const currency = holding.currency || 'KRW';
      const exchange = holding.exchange || 'KRX';
      const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
      const isEUR = currency === 'EUR';
      
      let quantity = 0;
      let purchaseValue = 0;
      let currentValue = 0;
      
      // RSU: 전체 수량 사용
      if (holding.type === 'rsu' && holding.totalQuantity !== undefined) {
        quantity = holding.totalQuantity;
        purchaseValue = (holding.purchasePrice || 0) * quantity;
        currentValue = currentPrice * quantity;
      } else if (holding.type === 'option' && holding.strikePrice !== undefined) {
        const intrinsicValue = currentPrice - holding.strikePrice;
        if (intrinsicValue > 0) {
          quantity = holding.quantity;
          purchaseValue = holding.strikePrice * quantity;
          currentValue = intrinsicValue * quantity;
        }
      } else {
        quantity = holding.quantity;
        purchaseValue = (holding.purchasePrice || 0) * quantity;
        currentValue = currentPrice * quantity;
      }
      
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
      key: 'type',
      label: '유형',
      sortable: true,
      render: (value) => {
        if (value === 'rsu') return 'RSU';
        if (value === 'option') return '옵션';
        return '일반';
      },
    },
    {
      key: 'quantity',
      label: '수량',
      sortable: true,
      render: (value, row) => {
        // RSU: 전체 수량 표시
        if (row.type === 'rsu' && row.totalQuantity !== undefined) {
          return new Intl.NumberFormat('ko-KR').format(row.totalQuantity) + '주';
        } else if (row.type === 'option' && row.strikePrice !== undefined) {
          return (
            <div>
              <div className="font-semibold">
                {new Intl.NumberFormat('ko-KR').format(value)}주
              </div>
              <div className="text-xs text-gray-500">
                @ ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(row.strikePrice)}
              </div>
            </div>
          );
        }
        return new Intl.NumberFormat('ko-KR').format(value) + '주';
      },
    },
    {
      key: 'purchasePrice',
      label: '매수 가격',
      sortable: true,
      render: (value, row) => {
        // RSU는 매수 가격이 없을 수 있음
        if (row.type === 'rsu' && (!value || value === 0)) {
          return '-';
        }
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
        const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
        const isEUR = currency === 'EUR';
        
        let quantity = 0;
        let krwValue = 0;
        let originalValue = 0;
        
        // RSU: 전체 수량 사용
        if (row.type === 'rsu' && row.totalQuantity !== undefined) {
          quantity = row.totalQuantity;
          krwValue = currentPrice * quantity;
          originalValue = currentPrice * quantity;
        } else if (row.type === 'option' && row.strikePrice !== undefined) {
          const intrinsicValue = currentPrice - row.strikePrice;
          if (intrinsicValue > 0) {
            quantity = row.quantity;
            krwValue = intrinsicValue * quantity;
            originalValue = intrinsicValue * quantity;
          } else {
            return <span className="text-gray-400">-</span>;
          }
        } else {
          quantity = row.quantity;
          krwValue = currentPrice * quantity;
          originalValue = currentPrice * quantity;
        }
        
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
        
        let quantity = 0;
        let purchaseValue = 0;
        let currentValue = 0;
        
        // RSU: 전체 수량 사용
        if (row.type === 'rsu' && row.totalQuantity !== undefined) {
          quantity = row.totalQuantity;
          purchaseValue = (row.purchasePrice || 0) * quantity;
          currentValue = currentPrice * quantity;
        } else if (row.type === 'option' && row.strikePrice !== undefined) {
          const intrinsicValue = currentPrice - row.strikePrice;
          if (intrinsicValue <= 0) {
            return <span className="text-gray-400">-</span>;
          }
          quantity = row.quantity;
          purchaseValue = row.strikePrice * quantity;
          currentValue = intrinsicValue * quantity;
        } else {
          quantity = row.quantity;
          purchaseValue = (row.purchasePrice || 0) * quantity;
          currentValue = currentPrice * quantity;
        }
        
        const gainLossOriginal = currentValue - purchaseValue;
        
        let gainLossKRW = gainLossOriginal;
        if (isUSD && exchangeRates) {
          gainLossKRW = gainLossOriginal * exchangeRates.USD_TO_KRW;
        } else if (isEUR && exchangeRates) {
          gainLossKRW = gainLossOriginal * exchangeRates.EUR_TO_KRW;
        }
        
        let percent = 0;
        if (purchaseValue > 0) {
          percent = ((currentValue - purchaseValue) / purchaseValue) * 100;
        } else if (purchaseValue === 0 && currentValue > 0) {
          percent = Infinity;
        }
        
        const isInfinity = percent === Infinity;
        
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
                {!isInfinity && (
                  <div className={`text-xs ${gainLossOriginal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({percent >= 0 ? '+' : ''}{percent.toFixed(2)}%)
                  </div>
                )}
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
                {!isInfinity && (
                  <div className={`text-xs ${gainLossOriginal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({percent >= 0 ? '+' : ''}{percent.toFixed(2)}%)
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={`font-semibold ${gainLossKRW >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {gainLossKRW >= 0 ? '+' : ''}
                  {new Intl.NumberFormat('ko-KR').format(Math.floor(gainLossKRW))}원
                </div>
                {!isInfinity && (
                  <div className={`text-xs ${gainLossKRW >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({percent >= 0 ? '+' : ''}{percent.toFixed(2)}%)
                  </div>
                )}
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
  ], [exchangeRates, filteredHoldings]);

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
            <h1 className="text-2xl font-bold text-gray-900">RSU/옵션</h1>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const currentHoldings = holdingsRef.current;
                  if (!exchangeRates || currentHoldings.length === 0) return;
                  
                  // 모든 심볼의 캐시 삭제
                  if (typeof window !== 'undefined') {
                    currentHoldings.forEach((holding) => {
                      if (holding.symbol) {
                        localStorage.removeItem(`stock-quotes-cache-${holding.symbol}`);
                      }
                    });
                  }
                  
                  const updated = await Promise.all(
                    currentHoldings.map(async (holding) => {
                      if (!holding.symbol) return holding;
                      try {
                        const price = await getStockPrice(holding.symbol, true); // 강제 새로고침
                        if (price !== null) {
                          return { ...holding, currentPrice: price };
                        }
                      } catch (error) {
                        // 에러 발생 시 기존 holding 반환
                      }
                      return holding;
                    })
                  );
                  setHoldings(updated);
                  setStockHoldings(updated);
                  
                  setTimeout(() => {
                    syncHoldingsToAsset();
                  }, 100);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                🔄 가격 새로고침
              </button>
              <button
                onClick={() => {
                  setFormData(getInitialFormData());
                  setIsFormOpen(true);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                + RSU/옵션 추가
              </button>
            </div>
          </div>

          {/* 통계 카드 */}
          <div className="mb-6">
            {/* 한 줄: 총 평가 금액 / 실현 손익 / 잔여 손익 / Vesting 예정 */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                <div className="text-xs text-gray-600 mb-1">총 평가 금액</div>
                <div className="text-xl font-bold text-gray-900">
                  {new Intl.NumberFormat('ko-KR').format(totalValue)}원
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  (실현 {new Intl.NumberFormat('ko-KR').format(realizedGainLoss.krw)}원 + 잔여 {new Intl.NumberFormat('ko-KR').format(unrealizedGainLoss.krw)}원)
                </div>
              </div>
              <div className="col-span-12 md:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                <div className="text-xs text-gray-600 mb-1">실현 손익</div>
                {realizedGainLoss.usd !== 0 ? (
                  <div>
                    <div className={`text-xl font-bold ${realizedGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {realizedGainLoss.krw >= 0 ? '+' : ''}
                      {new Intl.NumberFormat('ko-KR').format(realizedGainLoss.krw)}원
                    </div>
                    <div className={`text-xs text-gray-500 ${realizedGainLoss.usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      (${realizedGainLoss.usd >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(realizedGainLoss.usd)})
                    </div>
                  </div>
                ) : realizedGainLoss.eur !== 0 ? (
                  <div>
                    <div className={`text-xl font-bold ${realizedGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {realizedGainLoss.krw >= 0 ? '+' : ''}
                      {new Intl.NumberFormat('ko-KR').format(realizedGainLoss.krw)}원
                    </div>
                    <div className={`text-xs text-gray-500 ${realizedGainLoss.eur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      (€{realizedGainLoss.eur >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(realizedGainLoss.eur)})
                    </div>
                  </div>
                ) : (
                  <div className={`text-xl font-bold ${realizedGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {realizedGainLoss.krw >= 0 ? '+' : ''}
                    {new Intl.NumberFormat('ko-KR').format(realizedGainLoss.krw)}원
                  </div>
                )}
              </div>
              <div className="col-span-12 md:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                <div className="text-xs text-gray-600 mb-1">잔여 손익</div>
                {unrealizedGainLoss.usd !== 0 ? (
                  <div>
                    <div className={`text-xl font-bold ${unrealizedGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {unrealizedGainLoss.krw >= 0 ? '+' : ''}
                      {new Intl.NumberFormat('ko-KR').format(unrealizedGainLoss.krw)}원
                    </div>
                    <div className={`text-xs text-gray-500 ${unrealizedGainLoss.usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      (${unrealizedGainLoss.usd >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(unrealizedGainLoss.usd)})
                    </div>
                  </div>
                ) : unrealizedGainLoss.eur !== 0 ? (
                  <div>
                    <div className={`text-xl font-bold ${unrealizedGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {unrealizedGainLoss.krw >= 0 ? '+' : ''}
                      {new Intl.NumberFormat('ko-KR').format(unrealizedGainLoss.krw)}원
                    </div>
                    <div className={`text-xs text-gray-500 ${unrealizedGainLoss.eur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      (€{unrealizedGainLoss.eur >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(unrealizedGainLoss.eur)})
                    </div>
                  </div>
                ) : (
                  <div className={`text-xl font-bold ${unrealizedGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {unrealizedGainLoss.krw >= 0 ? '+' : ''}
                    {new Intl.NumberFormat('ko-KR').format(unrealizedGainLoss.krw)}원
                  </div>
                )}
              </div>
              <div className="col-span-12 md:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                <div className="text-xs text-gray-600 mb-1">Vesting 예정</div>
                <div className="space-y-2">
                {(() => {
                  // 주식명별로 그룹화하여 vesting 기간 계산
                  const groupedByStock = filteredHoldings.reduce((acc, holding) => {
                    if (holding.type === 'rsu' && holding.vestingDate) {
                      const key = holding.name;
                      if (!acc[key]) {
                        acc[key] = [];
                      }
                      acc[key].push(holding);
                    }
                    return acc;
                  }, {} as Record<string, StockHolding[]>);

                  const vestingInfo = Object.entries(groupedByStock).map(([stockName, holdings]) => {
                    // 모든 vesting 날짜 찾기
                    const vestingDates = holdings
                      .map(h => h.vestingDate)
                      .filter((date): date is string => !!date)
                      .sort();
                    
                    if (vestingDates.length === 0) return null;
                    
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const vestingInfoList = vestingDates.map(date => {
                      const vestingDate = new Date(date);
                      vestingDate.setHours(0, 0, 0, 0);
                      const diffTime = vestingDate.getTime() - today.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      
                      // 날짜 형식: YYYY.MM.DD
                      const year = vestingDate.getFullYear();
                      const month = String(vestingDate.getMonth() + 1).padStart(2, '0');
                      const day = String(vestingDate.getDate()).padStart(2, '0');
                      const dateStr = `${year}.${month}.${day}`;
                      
                      return {
                        date: dateStr,
                        daysRemaining: diffDays,
                      };
                    });
                    
                    return {
                      stockName,
                      vestingInfoList,
                    };
                  }).filter((info): info is { stockName: string; vestingInfoList: { date: string; daysRemaining: number }[] } => info !== null);

                  if (vestingInfo.length === 0) {
                    return <div className="text-sm text-gray-500">Vesting 정보 없음</div>;
                  }

                  return vestingInfo.map((info) => {
                    return (
                      <div key={info.stockName} className="text-sm">
                        <div className="font-semibold text-gray-900 mb-1">{info.stockName}</div>
                        <div className="space-y-1">
                          {info.vestingInfoList.map((vesting, index) => {
                            const isPast = vesting.daysRemaining < 0;
                            const daysText = isPast 
                              ? `만료됨 (${Math.abs(vesting.daysRemaining)}일 전)`
                              : vesting.daysRemaining === 0
                              ? '오늘'
                              : `${vesting.daysRemaining}일남음`;
                            
                            return (
                              <div key={index} className={`text-xs ${isPast ? 'text-gray-500' : 'text-blue-600'}`}>
                                {vesting.date} ({daysText})
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
                </div>
              </div>
            </div>
          </div>

          {/* 두 번째 줄: 구분선 + 보유 주식 주가 + 환율 */}
          <div className="border-t border-gray-200 pt-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-6">
                {/* 보유 주식 주가 */}
                <div className="flex flex-wrap gap-4 flex-1">
                  {filteredHoldings.length > 0 ? (
                    (() => {
                      // 주식명(symbol 또는 name)별로 그룹화하여 중복 제거
                      const uniqueHoldings = new Map<string, StockHolding>();
                      filteredHoldings.forEach((holding) => {
                        const key = holding.symbol || holding.name;
                        if (!uniqueHoldings.has(key)) {
                          uniqueHoldings.set(key, holding);
                        }
                      });
                      
                      return Array.from(uniqueHoldings.values()).map((holding) => {
                        const currentPrice = holding.currentPrice || 0;
                        const currency = holding.currency || 'KRW';
                        const exchange = holding.exchange || 'KRX';
                        const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
                        const isEUR = currency === 'EUR';
                        
                        let displayPrice = currentPrice;
                        if (isUSD && exchangeRates) {
                          displayPrice = currentPrice * exchangeRates.USD_TO_KRW;
                        } else if (isEUR && exchangeRates) {
                          displayPrice = currentPrice * exchangeRates.EUR_TO_KRW;
                        }
                        
                        return (
                          <div key={holding.symbol || holding.name} className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">{holding.symbol || holding.name}</span>
                            <span className="text-lg font-bold text-gray-900">
                              {currentPrice > 0 ? (
                                <>
                                  {new Intl.NumberFormat('ko-KR').format(Math.floor(displayPrice))}원
                                  {isUSD && (
                                    <span className="text-sm text-gray-500 ml-1">
                                      (${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currentPrice)})
                                    </span>
                                  )}
                                  {isEUR && (
                                    <span className="text-sm text-gray-500 ml-1">
                                      (€{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currentPrice)})
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </span>
                          </div>
                        );
                      });
                    })()
                  ) : (
                    <span className="text-sm text-gray-400">보유 주식 없음</span>
                  )}
                </div>
                
                {/* 구분선 */}
                <div className="h-8 w-px bg-gray-300"></div>
                
                {/* 환율 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">환율</span>
                  <span className="text-lg font-bold text-gray-900">
                    {exchangeRates ? (
                      <>{new Intl.NumberFormat('ko-KR').format(Math.floor(exchangeRates.USD_TO_KRW))}원</>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 입력 폼 모달 */}
          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {editingId ? 'RSU/옵션 수정' : 'RSU/옵션 추가'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      유형 *
                    </label>
                    <select
                      required
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'rsu' | 'option' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="rsu">RSU (제한주식단위)</option>
                      <option value="option">스톡옵션</option>
                    </select>
                  </div>

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

                  {/* RSU 필드 */}
                  {formData.type === 'rsu' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          전체 수량 *
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={formData.totalQuantity}
                          onChange={(e) => setFormData({ ...formData, totalQuantity: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          베스팅 예정일
                        </label>
                        <input
                          type="date"
                          value={formData.vestingDate}
                          onChange={(e) => setFormData({ ...formData, vestingDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </>
                  )}

                  {/* 옵션 필드 */}
                  {formData.type === 'option' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          행사 가격 *
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={formData.strikePrice}
                          onChange={(e) => setFormData({ ...formData, strikePrice: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          만료일
                        </label>
                        <input
                          type="date"
                          value={formData.expiryDate}
                          onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </>
                  )}

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

          {/* RSU/옵션 목록 테이블 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">RSU/옵션 목록</h2>
            </div>
            <Table data={filteredHoldings} columns={holdingColumns} searchable />
          </div>
        </div>
      </div>
    </div>
  );
}
