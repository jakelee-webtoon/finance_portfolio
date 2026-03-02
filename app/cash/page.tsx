'use client';

import { useState, useEffect, useMemo } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { Asset, DashboardState } from '@/types';
import { getDashboardState, getAssets, setAssets } from '@/lib/store';
import { getExchangeRates } from '@/lib/exchangeRate';
import { useAuth } from '@/hooks/useAuth';

export default function CashPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [assets, setAssetsState] = useState<Asset[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'cash' as 'cash',
    amount: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    currency: 'KRW',
    notes: '',
  });

  useEffect(() => {
    if (isAuthenticated !== true) return;
    const dashboardState = getDashboardState();
    setState(dashboardState);
    const allAssets = getAssets();
    // 현금 카테고리만 필터링
    setAssetsState(allAssets.filter((asset) => asset.category === 'cash'));
    
    // 환율 로드
    getExchangeRates().then((rates) => {
      setExchangeRates(rates);
    });
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

  const filteredAssets = useMemo(() => {
    if (!state) return [];
    let filtered = assets.filter((asset) => asset.category === 'cash');
    
    if (state.scope === 'combined') return filtered;
    return filtered.filter((asset) => asset.owner === state.scope || asset.owner === 'joint');
  }, [assets, state]);

  const totalCash = useMemo(() => {
    if (!exchangeRates) return 0;
    return Math.floor(filteredAssets.reduce((sum, asset) => {
      if (asset.currency === 'KRW') {
        return sum + asset.amount;
      } else if (asset.currency === 'USD') {
        return sum + asset.amount * exchangeRates.USD_TO_KRW;
      } else if (asset.currency === 'EUR') {
        return sum + asset.amount * exchangeRates.EUR_TO_KRW;
      }
      return sum + asset.amount;
    }, 0));
  }, [filteredAssets, exchangeRates]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const currentUser = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];

    if (editingId) {
      // 수정
      const updated = assets.map((asset) =>
        asset.id === editingId
          ? {
              ...asset,
              name: formData.name,
              amount: Number(formData.amount),
              owner: formData.owner,
              currency: formData.currency,
              notes: formData.notes || undefined,
              as_of_date: today,
              last_modified_by: currentUser,
            }
          : asset
      );
      setAssetsState(updated);
      // 전체 자산 목록도 업데이트
      const allAssets = getAssets();
      const updatedAllAssets = allAssets.map((asset) => {
        if (asset.id === editingId) {
          return {
            ...asset,
            name: formData.name,
            amount: Number(formData.amount),
            owner: formData.owner,
            currency: formData.currency,
            notes: formData.notes || undefined,
            as_of_date: today,
            last_modified_by: currentUser,
          };
        }
        return asset;
      });
      setAssets(updatedAllAssets);
      setEditingId(null);
    } else {
      // 추가
      const newAsset: Asset = {
        id: `cash-${Date.now()}`,
        name: formData.name,
        category: 'cash',
        amount: Number(formData.amount),
        owner: formData.owner,
        currency: formData.currency,
        notes: formData.notes || undefined,
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
      };
      const updated = [...assets, newAsset];
      setAssetsState(updated);
      // 전체 자산 목록에도 추가
      const allAssets = getAssets();
      setAssets([...allAssets, newAsset]);
    }

    // 폼 초기화
    setFormData({
      name: '',
      category: 'cash',
      amount: '',
      owner: 'joint',
      currency: 'KRW',
    });
    setIsFormOpen(false);
  };

  const handleEdit = (asset: Asset) => {
    setFormData({
      name: asset.name,
      category: 'cash',
      amount: String(asset.amount),
      owner: asset.owner,
      currency: asset.currency,
      notes: asset.notes || '',
    });
    setEditingId(asset.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      const updated = assets.filter((asset) => asset.id !== id);
      setAssetsState(updated);
      // 전체 자산 목록에서도 삭제
      const allAssets = getAssets();
      setAssets(allAssets.filter((asset) => asset.id !== id));
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({
      name: '',
      category: 'cash',
      amount: '',
      owner: 'joint',
      currency: 'KRW',
      notes: '',
    });
  };

  const getOwnerLabel = (value: string) => {
    const labels: Record<string, string> = {
      husband: '남편',
      wife: '아내',
      joint: '공동',
    };
    return labels[value] || value;
  };

  const assetColumns: Column<Asset>[] = [
    { key: 'name', label: '현금명', sortable: true },
    {
      key: 'notes',
      label: '내용',
      sortable: false,
      render: (value) => value || '-',
    },
    {
      key: 'amount',
      label: '금액',
      sortable: true,
      render: (value, row) => {
        const currency = row.currency || 'KRW';
        if (!exchangeRates) {
          if (currency === 'USD') {
            return `$${new Intl.NumberFormat('en-US').format(value)}`;
          } else if (currency === 'EUR') {
            return `€${new Intl.NumberFormat('en-US').format(value)}`;
          } else {
            return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
          }
        }
        
        // 모든 통화를 원화로 변환해서 표시
        let krwAmount = value;
        if (currency === 'USD') {
          krwAmount = value * exchangeRates.USD_TO_KRW;
        } else if (currency === 'EUR') {
          krwAmount = value * exchangeRates.EUR_TO_KRW;
        }
        
        return `${new Intl.NumberFormat('ko-KR').format(Math.floor(krwAmount))}원`;
      },
    },
    {
      key: 'owner',
      label: '소유자',
      sortable: true,
      render: (value) => getOwnerLabel(value),
    },
    {
      key: 'currency',
      label: '통화',
      sortable: true,
    },
    {
      key: 'as_of_date',
      label: '기준일',
      sortable: true,
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
  ];

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
            <h1 className="text-2xl font-bold text-gray-900">현금</h1>
            <button
              onClick={() => setIsFormOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              + 현금 추가
            </button>
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">총 현금</div>
              <div className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('ko-KR').format(totalCash)}원
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">현금 항목 수</div>
              <div className="text-2xl font-bold text-gray-900">{filteredAssets.length}개</div>
            </div>
          </div>

          {/* 입력 폼 모달 */}
          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {editingId ? '현금 수정' : '현금 추가'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      현금명 *
                    </label>
                    <select
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">선택하세요</option>
                      <option value="예금">예금</option>
                      <option value="현금">현금</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      금액 *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
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
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      비고/내용
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="추가 정보를 입력하세요"
                    />
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

          {/* 현금 목록 테이블 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">현금 목록</h2>
            </div>
            <Table data={filteredAssets} columns={assetColumns} searchable />
          </div>
        </div>
      </div>
    </div>
  );
}
