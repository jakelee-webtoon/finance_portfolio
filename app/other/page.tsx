'use client';

import { useState, useEffect, useMemo } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { Asset, DashboardState } from '@/types';
import { getDashboardState, getAssets, setAssets, syncFromFirebase } from '@/lib/store';
import { getExchangeRates } from '@/lib/exchangeRate';
import { useAuth } from '@/hooks/useAuth';

const CATEGORY_LABEL = '기타';

export default function OtherPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [assets, setAssetsState] = useState<Asset[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    currency: 'KRW',
    notes: '',
  });

  useEffect(() => {
    if (isAuthenticated !== true) return;
    const loadData = async () => {
      await syncFromFirebase();
      const dashboardState = getDashboardState();
      setState(dashboardState);
      const allAssets = getAssets();
      setAssetsState(allAssets.filter((a) => a.category === 'other'));
      getExchangeRates().then(setExchangeRates);
    };
    loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    const handleStateChange = () => {
      const newState = getDashboardState();
      setState(newState);
    };
    window.addEventListener('dashboardStateChanged', handleStateChange);
    window.addEventListener('storage', handleStateChange);
    return () => {
      window.removeEventListener('dashboardStateChanged', handleStateChange);
      window.removeEventListener('storage', handleStateChange);
    };
  }, []);

  const filteredAssets = useMemo(() => {
    if (!state) return [];
    const base = assets.filter((a) => a.category === 'other');
    if (state.scope === 'combined') return base;
    return base.filter((a) => a.owner === state.scope || a.owner === 'joint');
  }, [assets, state]);

  const totalOther = useMemo(() => {
    if (!exchangeRates) return 0;
    return Math.floor(
      filteredAssets.reduce((sum, a) => {
        if (a.currency === 'KRW') return sum + a.amount;
        if (a.currency === 'USD') return sum + a.amount * exchangeRates.USD_TO_KRW;
        if (a.currency === 'EUR') return sum + a.amount * exchangeRates.EUR_TO_KRW;
        return sum + a.amount;
      }, 0)
    );
  }, [filteredAssets, exchangeRates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentUser: 'husband' | 'wife' =
      state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];
    const allAssets = getAssets();

    if (editingId) {
      const updated = allAssets.map((a) =>
        a.id === editingId
          ? {
              ...a,
              name: formData.name,
              amount: Number(formData.amount),
              owner: formData.owner,
              currency: formData.currency,
              notes: formData.notes || undefined,
              as_of_date: today,
              last_modified_by: currentUser,
            }
          : a
      );
      setAssetsState(updated.filter((a) => a.category === 'other'));
      await setAssets(updated);
      setEditingId(null);
    } else {
      const newAsset: Asset = {
        id: `other-${Date.now()}`,
        name: formData.name,
        category: 'other',
        amount: Number(formData.amount),
        owner: formData.owner,
        currency: formData.currency,
        notes: formData.notes || undefined,
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
      };
      const updated = [...allAssets, newAsset];
      setAssetsState(updated.filter((a) => a.category === 'other'));
      await setAssets(updated);
    }

    setFormData({ name: '', amount: '', owner: 'joint', currency: 'KRW', notes: '' });
    setIsFormOpen(false);
  };

  const handleEdit = (asset: Asset) => {
    setFormData({
      name: asset.name,
      amount: String(asset.amount),
      owner: asset.owner,
      currency: asset.currency,
      notes: asset.notes || '',
    });
    setEditingId(asset.id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const allAssets = getAssets();
    const updated = allAssets.filter((a) => a.id !== id);
    setAssetsState(updated.filter((a) => a.category === 'other'));
    await setAssets(updated);
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({ name: '', amount: '', owner: 'joint', currency: 'KRW', notes: '' });
  };

  const getOwnerLabel = (v: string) =>
    ({ husband: '남편', wife: '아내', joint: '공동' }[v] ?? v);

  const columns: Column<Asset>[] = [
    { key: 'name', label: '항목명', sortable: true },
    {
      key: 'notes',
      label: '내용',
      sortable: false,
      render: (v) => v || '-',
    },
    {
      key: 'amount',
      label: '금액',
      sortable: true,
      render: (value, row) => {
        const currency = row.currency || 'KRW';
        if (!exchangeRates) {
          return currency === 'USD'
            ? `$${new Intl.NumberFormat('en-US').format(value)}`
            : currency === 'EUR'
            ? `€${new Intl.NumberFormat('en-US').format(value)}`
            : `${new Intl.NumberFormat('ko-KR').format(value)}원`;
        }
        let krw = value;
        if (currency === 'USD') krw = value * exchangeRates.USD_TO_KRW;
        if (currency === 'EUR') krw = value * exchangeRates.EUR_TO_KRW;
        return (
          <div>
            <div className="font-semibold">
              {new Intl.NumberFormat('ko-KR').format(Math.floor(krw))}원
            </div>
            {currency !== 'KRW' && (
              <div className="text-xs text-gray-400">
                {currency === 'USD' ? '$' : '€'}
                {new Intl.NumberFormat('en-US').format(value)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'owner',
      label: '소유자',
      sortable: true,
      render: getOwnerLabel,
    },
    { key: 'as_of_date', label: '기준일', sortable: true },
    {
      key: 'id',
      label: '관리',
      sortable: false,
      render: (_v, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleEdit(row)}
            className="text-xs text-blue-600 hover:underline"
          >
            수정
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="text-xs text-red-500 hover:underline"
          >
            삭제
          </button>
        </div>
      ),
    },
  ];

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
    <div className="min-h-screen bg-gray-50 min-w-0 max-w-[100vw] overflow-x-clip">
      <TopBar />
      <Navigation />
      <div className="px-3 py-4 sm:p-6 min-w-0">
        <div className="max-w-7xl mx-auto min-w-0">
          {/* 헤더 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">기타 자산</h1>
              <p className="text-sm text-gray-500 mt-1">자동차, 미공개 자산 등 기타 항목을 관리합니다.</p>
            </div>
            <button
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              항목 추가
            </button>
          </div>

          {/* KPI 카드 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="text-sm text-gray-500 mb-1 font-medium">기타 자산 합계</div>
              <div className="text-2xl font-bold text-gray-900 tabular-nums">
                {new Intl.NumberFormat('ko-KR').format(totalOther)}원
              </div>
              <div className="text-xs text-gray-400 mt-2">순자산 계산 제외 항목</div>
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="text-sm text-gray-500 mb-1 font-medium">항목 수</div>
              <div className="text-2xl font-bold text-gray-900 tabular-nums">
                {filteredAssets.length}
              </div>
              <div className="text-xs text-gray-400 mt-2">현재 범위 기준</div>
            </div>
          </div>

          {/* 폼 */}
          {isFormOpen && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editingId ? '항목 수정' : '새 항목 추가'}
              </h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">항목명 *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="예: 자동차"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">금액 *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">통화</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="KRW">KRW (원)</option>
                    <option value="USD">USD (달러)</option>
                    <option value="EUR">EUR (유로)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">소유자</label>
                  <select
                    value={formData.owner}
                    onChange={(e) =>
                      setFormData({ ...formData, owner: e.target.value as 'husband' | 'wife' | 'joint' })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="joint">공동</option>
                    <option value="husband">남편</option>
                    <option value="wife">아내</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">내용 (선택)</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="비고"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2 flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                  >
                    {editingId ? '수정 완료' : '추가'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl transition-colors"
                  >
                    취소
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 테이블 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900">기타 자산 목록</h2>
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                {filteredAssets.length}개
              </span>
            </div>
            <div className="p-1">
              {filteredAssets.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm italic">
                  기타 자산이 없습니다. 항목을 추가해보세요.
                </div>
              ) : (
                <Table data={filteredAssets} columns={columns} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
