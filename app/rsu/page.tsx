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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);
  const priceUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getInitialFormData = useCallback(() => ({
    symbol: '',
    name: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    currency: 'USD',
    exchange: 'NASDAQ' as 'KRX' | 'NASDAQ' | 'NYSE' | 'other',
    type: 'rsu' as 'stock' | 'rsu' | 'option',
    totalQuantity: '',
    vestingDate: '',
    strikePrice: '',
    expiryDate: '',
  }), []);
  
  const [formData, setFormData] = useState(getInitialFormData());

  // 초기 로드 (한 번만 실행)
  useEffect(() => {
    if (isAuthenticated !== true || isInitialLoaded) return;

    const loadData = async () => {
      await syncFromFirebase();
      const dashboardState = getDashboardState();
      setState(dashboardState);
      const allHoldings = getStockHoldings();
      const filtered = allHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
      setHoldings(filtered);
      const rates = await getExchangeRates();
      setExchangeRates(rates);
      setIsInitialLoaded(true);
    };
    loadData();
  }, [isAuthenticated, isInitialLoaded]);

  // DashboardState 변경 감지 (TopBar에서 scope 변경 시)
  useEffect(() => {
    const handleStateChange = () => {
      const newState = getDashboardState();
      setState(newState);
    };
    window.addEventListener('dashboardStateChanged', handleStateChange);
    return () => {
      window.removeEventListener('dashboardStateChanged', handleStateChange);
    };
  }, []);

  const filteredHoldings = useMemo(() => {
    if (!state) return [];
    let filtered = holdings.filter((h) => h.type === 'rsu' || h.type === 'option');
    
    if (state.scope !== 'combined') {
      filtered = filtered.filter((holding) => holding.owner === state.scope || holding.owner === 'joint');
    }

    // vesting 날짜 기준 최신순 정렬 (날짜 없는 항목은 맨 뒤)
    return [...filtered].sort((a, b) => {
      const dateA = a.vestingDate || a.expiryDate || '';
      const dateB = b.vestingDate || b.expiryDate || '';
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA);
    });
  }, [holdings, state]);

  // RSU/옵션을 포트폴리오 자산으로 동기화 (주식명별로 그룹화)
  const syncHoldingsToAsset = useCallback((holdingsToSync: StockHolding[]) => {
    if (!exchangeRates || holdingsToSync.length === 0) return;
    const currentHoldings = holdingsToSync;
    
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
        // 실현된 RSU는 자산에 포함하지 않음
        if (holding.isRealized) return;

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
  }, [exchangeRates, state]);

  // 가격 업데이트 함수 (interval에서 호출, 수동 새로고침에서도 사용)
  const updatePrices = useCallback(async (forceRefresh: boolean = false) => {
    // 매번 최신 holdings를 localStorage에서 가져옴 (다른 변경사항 반영)
    const allHoldings = getStockHoldings();
    const currentRsuHoldings = allHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
    if (currentRsuHoldings.length === 0) return;

    // 강제 새로고침인 경우 모든 심볼의 캐시 삭제
    if (forceRefresh && typeof window !== 'undefined') {
      currentRsuHoldings.forEach((holding) => {
        if (holding.symbol) {
          localStorage.removeItem(`stock-quotes-cache-${holding.symbol}`);
        }
      });
    }

    // RSU/옵션만 가격 업데이트 (기존 필드 모두 보존)
    const updatedRsuHoldings = await Promise.all(
      currentRsuHoldings.map(async (holding) => {
        if (!holding.symbol) return holding;
        try {
          const price = await getStockPrice(holding.symbol, forceRefresh);
          if (price !== null && price !== holding.currentPrice) {
            return { ...holding, currentPrice: price };
          }
        } catch {
          // 에러 발생 시 기존 holding 반환
        }
        return holding;
      })
    );

    // 가격만 변경된 경우에만 저장
    const hasChanges = updatedRsuHoldings.some((holding, index) =>
      holding.currentPrice !== currentRsuHoldings[index]?.currentPrice
    );

    if (hasChanges) {
      const updatedAllHoldings = allHoldings.map((holding) => {
        const updatedRsu = updatedRsuHoldings.find((rsu) => rsu.id === holding.id);
        return updatedRsu || holding;
      });
      setHoldings(updatedRsuHoldings);
      await setStockHoldings(updatedAllHoldings);
    }
  }, []);

  // 가격 업데이트 interval 설정 (초기 로드 완료 후 한 번만)
  useEffect(() => {
    if (!isInitialLoaded || !exchangeRates) return;
    
    // 이미 interval이 있으면 중복 생성 방지
    if (priceUpdateIntervalRef.current) return;

    // 초기 가격 업데이트
    updatePrices(true);
    
    // 1분마다 가격 업데이트
    priceUpdateIntervalRef.current = setInterval(() => {
      updatePrices(false);
    }, 60000);

    return () => {
      if (priceUpdateIntervalRef.current) {
        clearInterval(priceUpdateIntervalRef.current);
        priceUpdateIntervalRef.current = null;
      }
    };
  }, [isInitialLoaded, exchangeRates, updatePrices]);

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
        exchange: detectedExchange,
        currency: detectedCurrency,
        quantity: existingHolding.quantity || 0,
        purchasePrice: existingHolding.purchasePrice || 0,
        currentPrice: currentPrice !== undefined ? currentPrice : existingHolding.currentPrice,
        totalQuantity: formData.totalQuantity ? Number(formData.totalQuantity) : undefined,
        vestingDate: formData.vestingDate || undefined,
        strikePrice: formData.strikePrice ? Number(formData.strikePrice) : undefined,
        expiryDate: formData.expiryDate || undefined,
        as_of_date: today,
        last_modified_by: currentUser,
      };
      
      const updatedAllHoldings = allHoldings.map((holding) =>
        holding.id === editingId ? updatedHolding : holding
      );
      const rsuHoldings = updatedAllHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
      setHoldings(rsuHoldings);
      setEditingId(null);
      syncHoldingsToAsset(rsuHoldings);
      await setStockHoldings(updatedAllHoldings);
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
      const allHoldings = getStockHoldings();
      const updatedAllHoldings = [...allHoldings, newHolding];
      const rsuHoldings = updatedAllHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
      setHoldings(rsuHoldings);
      syncHoldingsToAsset(rsuHoldings);
      await setStockHoldings(updatedAllHoldings);
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

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const allHoldings = getStockHoldings();
    const updatedAllHoldings = allHoldings.filter((holding) => holding.id !== id);
    const updatedRsuHoldings = updatedAllHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
    setHoldings(updatedRsuHoldings);
    syncHoldingsToAsset(updatedRsuHoldings);
    await setStockHoldings(updatedAllHoldings);
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(getInitialFormData());
  };


  const handleToggleRealized = useCallback(async (id: string) => {
    const today = new Date().toISOString().split('T')[0];
    const currentUser: 'husband' | 'wife' = state?.scope === 'wife' ? 'wife' : 'husband';

    const allHoldings = getStockHoldings();
    const updatedAllHoldings = allHoldings.map((holding) => {
      if (holding.id !== id) return holding;
      const nextRealized = !holding.isRealized;
      const updated = {
        ...holding,
        as_of_date: today,
        last_modified_by: currentUser,
      } as StockHolding;
      if (nextRealized) {
        updated.isRealized = true;
      } else {
        delete updated.isRealized;
      }
      return updated;
    });

    const rsuHoldings = updatedAllHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
    setHoldings(rsuHoldings);
    syncHoldingsToAsset(rsuHoldings);

    await setStockHoldings(updatedAllHoldings);
  }, [syncHoldingsToAsset, state]);

  const handleSaveNote = useCallback(async (id: string, note: string) => {
    const today = new Date().toISOString().split('T')[0];
    const currentUser: 'husband' | 'wife' = state?.scope === 'wife' ? 'wife' : 'husband';

    const allHoldings = getStockHoldings();
    const updatedAllHoldings = allHoldings.map((holding) => {
      if (holding.id !== id) return holding;
      const updated = {
        ...holding,
        as_of_date: today,
        last_modified_by: currentUser,
      } as StockHolding;
      if (note.trim()) {
        updated.notes = note.trim();
      } else {
        delete updated.notes;
      }
      return updated;
    });

    const rsuHoldings = updatedAllHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
    setHoldings(rsuHoldings);
    setEditingNoteId(null);
    await setStockHoldings(updatedAllHoldings);
  }, [state]);

  // 공통 holding 가치 계산 헬퍼
  const calcHoldingValue = useCallback((holding: StockHolding, rates: Record<string, number>) => {
    const currentPrice = holding.currentPrice || 0;
    if (!currentPrice) return { krw: 0, usd: 0, eur: 0 };

    const currency = holding.currency || 'KRW';
    const exchange = holding.exchange || 'KRX';
    const isUSD = currency === 'USD' || exchange === 'NASDAQ' || exchange === 'NYSE';
    const isEUR = currency === 'EUR';

    let quantity = 0;
    let valueOriginal = 0;

    if (holding.type === 'rsu' && holding.totalQuantity !== undefined) {
      quantity = holding.totalQuantity;
      valueOriginal = currentPrice * quantity;
    } else if (holding.type === 'option' && holding.strikePrice !== undefined) {
      const intrinsicValue = currentPrice - holding.strikePrice;
      if (intrinsicValue <= 0) return { krw: 0, usd: 0, eur: 0 };
      quantity = holding.quantity;
      valueOriginal = intrinsicValue * quantity;
    } else {
      quantity = holding.quantity;
      valueOriginal = currentPrice * quantity;
    }

    if (isUSD) return { krw: valueOriginal * rates.USD_TO_KRW, usd: valueOriginal, eur: 0 };
    if (isEUR) return { krw: valueOriginal * rates.EUR_TO_KRW, usd: 0, eur: valueOriginal };
    return { krw: valueOriginal, usd: 0, eur: 0 };
  }, []);

  // 누적 RSU 금액 (실현 + 미실현 전체)
  const cumulativeValue = useMemo(() => {
    if (!exchangeRates) return { krw: 0, usd: 0, eur: 0 };
    const totals = filteredHoldings.reduce((acc, holding) => {
      const val = calcHoldingValue(holding, exchangeRates);
      acc.krw += val.krw;
      acc.usd += val.usd;
      acc.eur += val.eur;
      return acc;
    }, { krw: 0, usd: 0, eur: 0 });
    return { krw: Math.floor(totals.krw), usd: totals.usd, eur: totals.eur };
  }, [filteredHoldings, exchangeRates, calcHoldingValue]);

  // 현재 평가 금액 (미실현만)
  const currentUnrealizedValue = useMemo(() => {
    if (!exchangeRates) return { krw: 0, usd: 0, eur: 0 };
    const totals = filteredHoldings
      .filter((h) => !h.isRealized)
      .reduce((acc, holding) => {
        const val = calcHoldingValue(holding, exchangeRates);
        acc.krw += val.krw;
        acc.usd += val.usd;
        acc.eur += val.eur;
        return acc;
      }, { krw: 0, usd: 0, eur: 0 });
    return { krw: Math.floor(totals.krw), usd: totals.usd, eur: totals.eur };
  }, [filteredHoldings, exchangeRates, calcHoldingValue]);

  // 실현 손익: Vesting 완료된 RSU 중 미실현(아직 현금화 안 한 것)의 합계
  const realizedGainLoss = useMemo(() => {
    if (!exchangeRates) return { krw: 0, usd: 0, eur: 0 };
    const today = new Date().toISOString().split('T')[0];
    const totals = filteredHoldings
      .filter((h) => {
        if (h.isRealized) return false;
        return h.type === 'rsu' && !!h.vestingDate && h.vestingDate <= today;
      })
      .reduce((acc, holding) => {
        const val = calcHoldingValue(holding, exchangeRates);
        acc.krw += val.krw;
        acc.usd += val.usd;
        acc.eur += val.eur;
        return acc;
      }, { krw: 0, usd: 0, eur: 0 });
    return { krw: Math.floor(totals.krw), usd: totals.usd, eur: totals.eur };
  }, [filteredHoldings, exchangeRates, calcHoldingValue]);

  // 현금화한 금액 (isRealized === true) — 누적 RSU 카드 breakdown용
  const cashedOutValue = useMemo(() => {
    if (!exchangeRates) return { krw: 0, usd: 0, eur: 0 };
    const totals = filteredHoldings
      .filter((h) => h.isRealized === true)
      .reduce((acc, holding) => {
        const val = calcHoldingValue(holding, exchangeRates);
        acc.krw += val.krw;
        acc.usd += val.usd;
        acc.eur += val.eur;
        return acc;
      }, { krw: 0, usd: 0, eur: 0 });
    return { krw: Math.floor(totals.krw), usd: totals.usd, eur: totals.eur };
  }, [filteredHoldings, exchangeRates, calcHoldingValue]);

  // 잔여 손익 (isRealized !== true)
  const unrealizedGainLoss = useMemo(() => {
    if (!exchangeRates) return { krw: 0, usd: 0, eur: 0 };
    const totals = filteredHoldings
      .filter((h) => !h.isRealized)
      .reduce((acc, holding) => {
        const val = calcHoldingValue(holding, exchangeRates);
        acc.krw += val.krw;
        acc.usd += val.usd;
        acc.eur += val.eur;
        return acc;
      }, { krw: 0, usd: 0, eur: 0 });
    return { krw: Math.floor(totals.krw), usd: totals.usd, eur: totals.eur };
  }, [filteredHoldings, exchangeRates, calcHoldingValue]);

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
      key: 'vestingDate',
      label: 'Vesting 일자',
      sortable: true,
      render: (_, row) => {
        const date = row.type === 'rsu' ? row.vestingDate : row.expiryDate;
        if (!date) return <span className="text-gray-400">-</span>;
        const d = new Date(date);
        const str = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
        return <span className="text-gray-800">{str}</span>;
      },
    },
    {
      key: 'notes',
      label: '비고',
      sortable: false,
      render: (value, row) => {
        const isEditing = editingNoteId === row.id;
        if (isEditing) {
          return (
            <input
              autoFocus
              type="text"
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              onBlur={() => handleSaveNote(row.id, noteValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNote(row.id, noteValue);
                if (e.key === 'Escape') setEditingNoteId(null);
              }}
              className="w-full min-w-[120px] px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="비고 입력..."
            />
          );
        }
        return (
          <div
            onClick={() => {
              setEditingNoteId(row.id);
              setNoteValue(row.notes || '');
            }}
            className="min-w-[100px] px-2 py-1 text-sm text-gray-700 rounded cursor-pointer hover:bg-gray-100 transition-colors"
          >
            {row.notes ? (
              <span>{row.notes}</span>
            ) : (
              <span className="text-gray-300 select-none">클릭하여 입력</span>
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
            onClick={() => handleToggleRealized(row.id)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              row.isRealized
                ? 'bg-gray-500 text-white hover:bg-gray-600'
                : 'text-green-600 border border-green-600 hover:bg-green-50'
            }`}
          >
            {row.isRealized ? '실현됨' : '미실현'}
          </button>
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
  ], [exchangeRates, filteredHoldings, handleToggleRealized, editingNoteId, noteValue, handleSaveNote]);

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
                  if (!exchangeRates) return;
                  // 매번 최신 holdings를 가져옴 (비고/실현 상태 등 반영)
                  const allHoldings = getStockHoldings();
                  const currentRsuHoldings = allHoldings.filter((h) => h.type === 'rsu' || h.type === 'option');
                  if (currentRsuHoldings.length === 0) return;

                  // 모든 심볼의 캐시 삭제
                  if (typeof window !== 'undefined') {
                    currentRsuHoldings.forEach((holding) => {
                      if (holding.symbol) {
                        localStorage.removeItem(`stock-quotes-cache-${holding.symbol}`);
                      }
                    });
                  }

                  const updatedRsuHoldings = await Promise.all(
                    currentRsuHoldings.map(async (holding) => {
                      if (!holding.symbol) return holding;
                      try {
                        const price = await getStockPrice(holding.symbol, true);
                        if (price !== null) {
                          return { ...holding, currentPrice: price };
                        }
                      } catch {
                        // 에러 발생 시 기존 holding 반환
                      }
                      return holding;
                    })
                  );
                  const updatedAllHoldings = allHoldings.map((h) => {
                    const updated = updatedRsuHoldings.find((r) => r.id === h.id);
                    return updated || h;
                  });
                  setHoldings(updatedRsuHoldings);
                  syncHoldingsToAsset(updatedRsuHoldings);
                  await setStockHoldings(updatedAllHoldings);
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
            <div className="grid grid-cols-12 gap-3">
              {/* 카드 1: 현재 평가 금액 (미실현) */}
              <div className="col-span-12 md:col-span-3 bg-blue-50 border border-blue-100 rounded-lg shadow-sm p-4">
                <div className="text-xs text-blue-500 font-medium mb-1">현재 평가 금액</div>
                <div className="text-2xl font-bold text-blue-900">
                  {new Intl.NumberFormat('ko-KR').format(currentUnrealizedValue.krw)}원
                </div>
                {currentUnrealizedValue.usd !== 0 && (
                  <div className="text-sm text-blue-400 mt-1">
                    (${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currentUnrealizedValue.usd)})
                  </div>
                )}
                {currentUnrealizedValue.eur !== 0 && (
                  <div className="text-sm text-blue-400 mt-1">
                    (€{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currentUnrealizedValue.eur)})
                  </div>
                )}
                <div className="text-xs text-blue-400 mt-2">미실현 RSU 기준</div>
              </div>

              {/* 카드 2: 실현 손익 */}
              <div className="col-span-12 md:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-xs text-gray-500 mb-1">실현 손익</div>
                <div className={`text-2xl font-bold ${realizedGainLoss.krw >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {realizedGainLoss.krw >= 0 ? '+' : ''}
                  {new Intl.NumberFormat('ko-KR').format(realizedGainLoss.krw)}원
                </div>
                {realizedGainLoss.usd !== 0 && (
                  <div className={`text-sm mt-1 ${realizedGainLoss.usd >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    (${realizedGainLoss.usd >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(realizedGainLoss.usd)})
                  </div>
                )}
                {realizedGainLoss.eur !== 0 && (
                  <div className={`text-sm mt-1 ${realizedGainLoss.eur >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    (€{realizedGainLoss.eur >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(realizedGainLoss.eur)})
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-2">Vesting 완료 + 미실현 합계</div>
              </div>

              {/* 카드 3: 누적 RSU 금액 */}
              <div className="col-span-12 md:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-xs text-gray-500 mb-1">누적 RSU 금액</div>
                <div className="text-2xl font-bold text-gray-900">
                  {new Intl.NumberFormat('ko-KR').format(cumulativeValue.krw)}원
                </div>
                {cumulativeValue.usd !== 0 && (
                  <div className="text-sm text-gray-500 mt-1">
                    (${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cumulativeValue.usd)})
                  </div>
                )}
                {cumulativeValue.eur !== 0 && (
                  <div className="text-sm text-gray-500 mt-1">
                    (€{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cumulativeValue.eur)})
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-2">
                  실현(현금화) {new Intl.NumberFormat('ko-KR').format(cashedOutValue.krw)}원 + 미실현 {new Intl.NumberFormat('ko-KR').format(unrealizedGainLoss.krw)}원
                </div>
              </div>

              {/* 카드 4: Vesting 일정 */}
              <div className="col-span-12 md:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-xs text-gray-500 mb-2">Vesting 일정</div>
                {(() => {
                  const todayDate = new Date();
                  todayDate.setHours(0, 0, 0, 0);

                  const allVestingRows = filteredHoldings
                    .filter((h) => h.type === 'rsu' && h.vestingDate)
                    .map((h) => {
                      const vestingDate = new Date(h.vestingDate!);
                      vestingDate.setHours(0, 0, 0, 0);
                      const diffDays = Math.ceil((vestingDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
                      const year = vestingDate.getFullYear();
                      const month = String(vestingDate.getMonth() + 1).padStart(2, '0');
                      const day = String(vestingDate.getDate()).padStart(2, '0');
                      return { holding: h, dateStr: `${year}.${month}.${day}`, daysRemaining: diffDays };
                    })
                    .sort((a, b) => b.holding.vestingDate!.localeCompare(a.holding.vestingDate!));

                  if (allVestingRows.length === 0) {
                    return <div className="text-sm text-gray-400">Vesting 정보 없음</div>;
                  }

                  const grouped = allVestingRows.reduce((acc, row) => {
                    const key = row.holding.name;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(row);
                    return acc;
                  }, {} as Record<string, typeof allVestingRows>);

                  return (
                    <div className="space-y-3">
                      {Object.entries(grouped).map(([stockName, rows]) => (
                        <div key={stockName}>
                          <div className="text-xs font-semibold text-gray-600 mb-1">{stockName}</div>
                          <div className="space-y-1">
                            {rows.map((row, idx) => {
                              const isCompleted = row.daysRemaining < 0;
                              const isToday = row.daysRemaining === 0;
                              const daysText = isCompleted
                                ? 'Vesting 완료'
                                : isToday
                                ? '오늘'
                                : `${row.daysRemaining}일 남음`;
                              return (
                                <div key={idx} className="flex items-center gap-2 text-sm">
                                  <span className={isCompleted ? 'text-gray-400' : 'text-gray-800'}>
                                    {row.dateStr}
                                  </span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                    isCompleted
                                      ? 'bg-gray-100 text-gray-400'
                                      : isToday
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-blue-50 text-blue-600'
                                  }`}>
                                    {daysText}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
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
