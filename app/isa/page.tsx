'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { DashboardState, StockHolding } from '@/types';
import { getDashboardState, getStockHoldings, setStockHoldings, syncFromFirebase } from '@/lib/store';
import { getExchangeRates } from '@/lib/exchangeRate';
import { getStockPrice, getStockQuotes } from '@/lib/stockApi';
import { useAuth } from '@/hooks/useAuth';
import {
  ISA_ANNUAL_CONTRIBUTION_LIMIT,
  ISA_BASIC_TAX_FREE_LIMIT,
  ISA_SEPARATE_TAX_RATE,
  ISA_TOTAL_CONTRIBUTION_LIMIT,
  formatKrw,
  getEtfCategoryLabel,
  getHoldingCurrentValueKrw,
  getHoldingGainLossKrw,
  getHoldingPurchaseValueKrw,
  getOwnerLabel,
  getProviderLabel,
  isIsaEtfHolding,
} from '@/lib/investments';

type Owner = 'husband' | 'wife' | 'joint';
type Exchange = 'KRX' | 'NASDAQ' | 'NYSE' | 'other';

export default function IsaPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const getInitialFormData = useCallback(() => ({
    symbol: '',
    name: '',
    quantity: '',
    purchasePrice: '',
    currentPrice: '',
    owner: 'joint' as Owner,
    etfCategory: 'sp500' as NonNullable<StockHolding['etfCategory']>,
    provider: 'TIGER' as NonNullable<StockHolding['provider']>,
    notes: '',
  }), []);

  const [formData, setFormData] = useState(getInitialFormData());

  useEffect(() => {
    if (isAuthenticated !== true) return;

    const loadData = async () => {
      await syncFromFirebase();
      setState(getDashboardState());
      setHoldings(getStockHoldings());
      setExchangeRates(await getExchangeRates());
    };

    loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    const handleStateChange = () => setState(getDashboardState());
    window.addEventListener('dashboardStateChanged', handleStateChange);
    window.addEventListener('storage', handleStateChange);
    return () => {
      window.removeEventListener('dashboardStateChanged', handleStateChange);
      window.removeEventListener('storage', handleStateChange);
    };
  }, []);

  useEffect(() => {
    if (!exchangeRates) return;

    const updatePrices = async () => {
      const allHoldings = getStockHoldings();
      const etfs = allHoldings.filter(isIsaEtfHolding);
      if (etfs.length === 0) return;

      const quotes = await getStockQuotes(etfs.map((holding) => holding.symbol));
      const updatedAllHoldings = allHoldings.map((holding) => {
        if (!isIsaEtfHolding(holding)) return holding;
        const quote = quotes[holding.symbol];
        return quote && quote.price !== holding.currentPrice ? { ...holding, currentPrice: quote.price } : holding;
      });

      const hasChanges = updatedAllHoldings.some((holding, index) => holding.currentPrice !== allHoldings[index]?.currentPrice);
      if (hasChanges) {
        setHoldings(updatedAllHoldings);
        await setStockHoldings(updatedAllHoldings);
      }
    };

    updatePrices();
  }, [exchangeRates]);

  const filteredEtfs = useMemo(() => {
    if (!state) return [];
    const etfs = holdings.filter(isIsaEtfHolding);
    if (state.scope === 'combined') return etfs;
    return etfs.filter((holding) => holding.owner === state.scope || holding.owner === 'joint');
  }, [holdings, state]);

  const summary = useMemo(() => {
    if (!exchangeRates) {
      return {
        currentValue: 0,
        purchaseValue: 0,
        gainLoss: 0,
        remainingAnnualContribution: ISA_ANNUAL_CONTRIBUTION_LIMIT,
        remainingTotalContribution: ISA_TOTAL_CONTRIBUTION_LIMIT,
        taxableProfit: 0,
        estimatedTax: 0,
      };
    }

    const currentValue = filteredEtfs.reduce((sum, holding) => sum + getHoldingCurrentValueKrw(holding, exchangeRates), 0);
    const purchaseValue = filteredEtfs.reduce((sum, holding) => sum + getHoldingPurchaseValueKrw(holding, exchangeRates), 0);
    const gainLoss = currentValue - purchaseValue;
    const taxableProfit = Math.max(0, gainLoss - ISA_BASIC_TAX_FREE_LIMIT);

    return {
      currentValue,
      purchaseValue,
      gainLoss,
      remainingAnnualContribution: Math.max(0, ISA_ANNUAL_CONTRIBUTION_LIMIT - purchaseValue),
      remainingTotalContribution: Math.max(0, ISA_TOTAL_CONTRIBUTION_LIMIT - purchaseValue),
      taxableProfit,
      estimatedTax: taxableProfit * ISA_SEPARATE_TAX_RATE,
    };
  }, [filteredEtfs, exchangeRates]);

  const categoryRows = useMemo(() => {
    if (!exchangeRates || summary.currentValue <= 0) return [];
    const byCategory = filteredEtfs.reduce((acc, holding) => {
      const label = getEtfCategoryLabel(holding.etfCategory);
      acc[label] = (acc[label] || 0) + getHoldingCurrentValueKrw(holding, exchangeRates);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, pct: (value / summary.currentValue) * 100 }));
  }, [filteredEtfs, exchangeRates, summary.currentValue]);

  const currentUser: 'husband' | 'wife' = state?.scope === 'wife' ? 'wife' : 'husband';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const today = new Date().toISOString().split('T')[0];
    const symbol = formData.symbol.trim().toUpperCase();
    let currentPrice = formData.currentPrice ? Number(formData.currentPrice) : undefined;

    if (symbol && currentPrice === undefined) {
      try {
        const fetchedPrice = await getStockPrice(symbol);
        if (fetchedPrice !== null) currentPrice = fetchedPrice;
      } catch {
        // 수동 현재가가 없고 API도 실패하면 매수가 기준으로 표시
      }
    }

    const baseHolding = {
      symbol,
      name: formData.name.trim(),
      quantity: Number(formData.quantity),
      purchasePrice: Number(formData.purchasePrice),
      currentPrice,
      owner: formData.owner,
      currency: 'KRW',
      exchange: 'KRX' as Exchange,
      type: 'etf' as const,
      accountType: 'isa' as const,
      etfCategory: formData.etfCategory,
      provider: formData.provider,
      notes: formData.notes.trim() || undefined,
      as_of_date: today,
      last_modified_by: currentUser,
    };

    const allHoldings = getStockHoldings();
    const updatedAllHoldings = editingId
      ? allHoldings.map((holding) => holding.id === editingId ? { ...holding, ...baseHolding } : holding)
      : [
          ...allHoldings,
          {
            id: `etf-${Date.now()}`,
            ...baseHolding,
            source_type: 'manual' as const,
          },
        ];

    setHoldings(updatedAllHoldings);
    await setStockHoldings(updatedAllHoldings);
    setFormData(getInitialFormData());
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleEdit = (holding: StockHolding) => {
    setFormData({
      symbol: holding.symbol,
      name: holding.name,
      quantity: String(holding.quantity),
      purchasePrice: String(holding.purchasePrice),
      currentPrice: holding.currentPrice ? String(holding.currentPrice) : '',
      owner: holding.owner,
      etfCategory: holding.etfCategory || 'other',
      provider: holding.provider || 'other',
      notes: holding.notes || '',
    });
    setEditingId(holding.id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const updatedAllHoldings = getStockHoldings().filter((holding) => holding.id !== id);
    setHoldings(updatedAllHoldings);
    await setStockHoldings(updatedAllHoldings);
  };

  const columns: Column<StockHolding>[] = useMemo(() => [
    { key: 'symbol', label: '코드', sortable: true },
    { key: 'name', label: 'ETF명', sortable: true },
    {
      key: 'etfCategory',
      label: '분류',
      sortable: true,
      render: (value) => getEtfCategoryLabel(value),
    },
    {
      key: 'provider',
      label: '운용사',
      sortable: true,
      render: (value) => getProviderLabel(value),
    },
    {
      key: 'quantity',
      label: '수량',
      sortable: true,
      render: (value) => `${new Intl.NumberFormat('ko-KR').format(value)}주`,
    },
    {
      key: 'purchasePrice',
      label: '평균단가',
      sortable: true,
      render: (value) => formatKrw(value),
    },
    {
      key: 'currentPrice',
      label: '현재가',
      sortable: true,
      render: (value, row) => formatKrw(value || row.purchasePrice),
    },
    {
      key: 'value',
      label: '평가금액',
      render: (_, row) => formatKrw(getHoldingCurrentValueKrw(row, exchangeRates)),
    },
    {
      key: 'gainLoss',
      label: '손익',
      render: (_, row) => {
        const gainLoss = getHoldingGainLossKrw(row, exchangeRates);
        const purchaseValue = getHoldingPurchaseValueKrw(row, exchangeRates);
        const pct = purchaseValue > 0 ? (gainLoss / purchaseValue) * 100 : 0;
        return (
          <div>
            <div className={`font-semibold ${gainLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {gainLoss >= 0 ? '+' : ''}{formatKrw(gainLoss)}
            </div>
            <div className={`text-xs ${gainLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
            </div>
          </div>
        );
      },
    },
    {
      key: 'owner',
      label: '소유자',
      sortable: true,
      render: (value) => getOwnerLabel(value),
    },
    {
      key: 'actions',
      label: '작업',
      render: (_, row) => (
        <div className="flex gap-2">
          <button onClick={() => handleEdit(row)} className="px-3 py-1 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors">
            수정
          </button>
          <button onClick={() => handleDelete(row.id)} className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 transition-colors">
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ISA</h1>
              <p className="text-sm text-gray-500 mt-1">ETF는 모두 중개형 ISA 계좌 자산으로 관리합니다.</p>
            </div>
            <button
              onClick={() => {
                setFormData(getInitialFormData());
                setEditingId(null);
                setIsFormOpen(true);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
            >
              + ISA ETF 추가
            </button>
          </div>

          <div className="grid grid-cols-12 gap-4 mb-8">
            <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-gray-900">ISA 계좌란?</h2>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">중개형</span>
              </div>
              <div className="space-y-1 text-sm text-gray-700">
                <p className="font-semibold">중단기 자산 형성 + 절세 계좌</p>
                <p className="font-semibold">대상: 국내 상장된 해외 ETF</p>
              </div>
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-indigo-50 rounded-2xl border border-indigo-100 p-5">
              <div className="text-xs font-bold text-indigo-500 mb-2">납입한도</div>
              <div className="text-xl font-black text-indigo-900">{formatKrw(ISA_ANNUAL_CONTRIBUTION_LIMIT)}</div>
              <div className="text-xs text-indigo-700/80 mt-1">연간 기준 · 총 {formatKrw(ISA_TOTAL_CONTRIBUTION_LIMIT)}</div>
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-emerald-50 rounded-2xl border border-emerald-100 p-5">
              <div className="text-xs font-bold text-emerald-600 mb-2">세제 혜택</div>
              <div className="text-xl font-black text-emerald-900">일반형 {formatKrw(ISA_BASIC_TAX_FREE_LIMIT)}</div>
              <div className="text-xs text-emerald-700/80 mt-1">초과분 {(ISA_SEPARATE_TAX_RATE * 100).toFixed(1)}% 분리과세</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900">ISA 참고 설명</h2>
            </div>
            <div className="divide-y divide-gray-100">
              <InfoAccordion title="혜택">
                <div className="space-y-5">
                  <div>
                    <p className="font-bold text-gray-900">ISA 계좌에서 번 돈은 비과세 한도까지 세금이 없습니다.</p>
                    <p>예: 2,000만원에서 10% 수익이 나면 수익은 200만원입니다.</p>
                    <p>일반 계좌는 15.4% 세금으로 308,000원을 내지만, ISA 계좌는 비과세 혜택 적용 시 0원입니다.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">비과세 한도를 넘는 초과분은 9.9% 분리과세됩니다.</p>
                    <p>예: 일반형에서 300만원 수익이 나면 비과세 한도 200만원을 제외하고, 100만원에 대해서만 9.9% 세금이 적용됩니다.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">손익통산으로 순이익에 대해서만 세금이 부과됩니다.</p>
                    <p>예: A ETF에서 -200만원, B ETF에서 +400만원이면 순이익은 200만원입니다.</p>
                    <p>일반 계좌는 번 돈만 보고 세금을 매기지만, ISA는 순이익 기준으로 보고 비과세 한도 안이면 세금이 없습니다.</p>
                  </div>
                </div>
              </InfoAccordion>

              <InfoAccordion title="납입 한도와 유형">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <LimitLine label="연간 납입한도" value="2,000만원" />
                    <LimitLine label="총 납입 한도" value="1억원 (5년)" />
                    <LimitLine label="의무 가입 기간" value="3년" />
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700 leading-relaxed">
                    <p className="font-bold text-gray-900 mb-1">유형: 중개형 (직접 투자)</p>
                    <p>신탁형은 은행에서 직접 운용하기 때문에 ETF 직접 투자가 어렵고, 일임형은 전문가가 운용하는 대신 수수료가 존재합니다.</p>
                  </div>
                </div>
              </InfoAccordion>

              <InfoAccordion title="주의사항">
                <div className="space-y-5">
                  <div>
                    <p className="font-bold text-gray-900">만기 설정은 최대한 길게 잡는 편이 좋습니다.</p>
                    <p>3년이 지나면 의무가입이 종료되어 언제든 해지 가능하고, 매도 시점을 더 자유롭게 가져갈 수 있습니다.</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">중도인출은 가능하지만 원금만 가능합니다.</p>
                    <p>수익금은 중도 인출할 수 없습니다.</p>
                  </div>
                </div>
              </InfoAccordion>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 mb-8">
            <SummaryCard label="평가금액" value={formatKrw(summary.currentValue)} badge="VALUE" tone="blue" />
            <SummaryCard
              label="총 손익"
              value={`${summary.gainLoss >= 0 ? '+' : ''}${formatKrw(summary.gainLoss)}`}
              badge={summary.gainLoss >= 0 ? 'PROFIT' : 'LOSS'}
              tone={summary.gainLoss >= 0 ? 'green' : 'rose'}
            />
            <SummaryCard label="올해 남은 납입한도" value={formatKrw(summary.remainingAnnualContribution)} badge="2026" tone="indigo" />
            <SummaryCard label="총 한도 잔여" value={formatKrw(summary.remainingTotalContribution)} badge="LIMIT" tone="amber" />
          </div>

          <div className="grid grid-cols-12 gap-6 mb-8 items-start">
            <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">ISA 세금 예상</h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">일반형 기준</span>
              </div>
              <div className="space-y-3">
                <MetricRow label="순이익" value={`${summary.gainLoss >= 0 ? '+' : ''}${formatKrw(summary.gainLoss)}`} />
                <MetricRow label="비과세 한도" value={formatKrw(ISA_BASIC_TAX_FREE_LIMIT)} />
                <MetricRow label="분리과세 대상" value={formatKrw(summary.taxableProfit)} />
                <MetricRow label="예상 세금" value={formatKrw(summary.estimatedTax)} />
              </div>
              <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                실제 과세는 만기/해지 시 계좌 순이익 기준으로 정산됩니다.
              </p>
            </div>

            <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">ETF 구성</h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">{filteredEtfs.length}개 보유</span>
              </div>
              {categoryRows.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400 italic">ETF를 추가하면 분류별 비중이 표시됩니다.</div>
              ) : (
                <div className="space-y-3">
                  {categoryRows.map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold text-gray-700">{row.label}</span>
                        <span className="text-gray-500">{formatKrw(row.value)} · {row.pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, row.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{editingId ? 'ISA ETF 수정' : 'ISA ETF 추가'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="ETF 코드 *">
                      <input required value={formData.symbol} onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })} className="input" placeholder="예: 360750" />
                    </Field>
                    <Field label="ETF명 *">
                      <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input" placeholder="예: TIGER 미국S&P500" />
                    </Field>
                    <Field label="수량 *">
                      <input required type="number" min="0" step="0.01" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className="input" />
                    </Field>
                    <Field label="평균단가 *">
                      <input required type="number" min="0" step="0.01" value={formData.purchasePrice} onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })} className="input" />
                    </Field>
                    <Field label="현재가">
                      <input type="number" min="0" step="0.01" value={formData.currentPrice} onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })} className="input" placeholder="비우면 자동 조회 시도" />
                    </Field>
                    <Field label="소유자">
                      <select value={formData.owner} onChange={(e) => setFormData({ ...formData, owner: e.target.value as Owner })} className="input">
                        <option value="joint">공동</option>
                        <option value="husband">남편</option>
                        <option value="wife">아내</option>
                      </select>
                    </Field>
                    <Field label="분류">
                      <select value={formData.etfCategory} onChange={(e) => setFormData({ ...formData, etfCategory: e.target.value as NonNullable<StockHolding['etfCategory']> })} className="input">
                        <option value="sp500">S&P500</option>
                        <option value="nasdaq100">나스닥100</option>
                        <option value="dividend">배당</option>
                        <option value="bond">채권</option>
                        <option value="domestic_index">국내지수</option>
                        <option value="sector">섹터</option>
                        <option value="other">기타</option>
                      </select>
                    </Field>
                    <Field label="운용사">
                      <select value={formData.provider} onChange={(e) => setFormData({ ...formData, provider: e.target.value as NonNullable<StockHolding['provider']> })} className="input">
                        <option value="TIGER">TIGER</option>
                        <option value="KODEX">KODEX</option>
                        <option value="ACE">ACE</option>
                        <option value="SOL">SOL</option>
                        <option value="KBSTAR">KBSTAR</option>
                        <option value="HANARO">HANARO</option>
                        <option value="other">기타</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="메모">
                    <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input min-h-[84px]" placeholder="분배금, 매수 이유, 리밸런싱 메모" />
                  </Field>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm text-indigo-700">
                    ETF는 자동으로 ISA 계좌, 원화, KRX 상장 자산으로 저장됩니다.
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors">
                      {editingId ? '수정' : '추가'}
                    </button>
                    <button type="button" onClick={() => { setIsFormOpen(false); setEditingId(null); setFormData(getInitialFormData()); }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors">
                      취소
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <Table data={filteredEtfs} columns={columns} searchable searchPlaceholder="ETF 코드, 이름, 분류 검색..." />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, badge, tone }: { label: string; value: string; badge: string; tone: 'blue' | 'green' | 'rose' | 'indigo' | 'amber' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone];

  return (
    <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${toneClass}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19h16M7 16V8m5 8V5m5 11v-6" />
          </svg>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${toneClass}`}>{badge}</span>
      </div>
      <div className="text-xs text-gray-500 font-medium mb-1">{label}</div>
      <div className={`text-2xl font-bold tracking-tight ${tone === 'green' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-2 last:border-b-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-bold text-gray-900">{value}</span>
    </div>
  );
}

function InfoAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-bold text-gray-900 hover:bg-gray-50">
        <span>{title}</span>
        <span className="text-gray-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="px-5 pb-5 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </details>
  );
}

function LimitLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-black text-gray-900">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
