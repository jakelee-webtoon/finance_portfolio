'use client';

import { useState, useEffect, useMemo } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { Income, DashboardState } from '@/types';
import { getDashboardState, getIncome, setIncome } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';

export default function IncomePage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    source: '',
    amount: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    category: 'salary' as 'salary' | 'bonus' | 'investment' | 'other',
    currency: 'KRW',
    period: 'monthly' as 'monthly' | 'yearly' | 'one-time',
  });

  useEffect(() => {
    if (isAuthenticated !== true) return;
    const dashboardState = getDashboardState();
    setState(dashboardState);
    setIncomes(getIncome());
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

  const filteredIncomes = useMemo(() => {
    if (!state) return [];
    if (state.scope === 'combined') return incomes;
    return incomes.filter((income) => income.owner === state.scope || income.owner === 'joint');
  }, [incomes, state]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const currentUser = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];

    if (editingId) {
      // 수정
      const updated = incomes.map((income) =>
        income.id === editingId
          ? {
              ...income,
              ...formData,
              amount: Number(formData.amount),
              as_of_date: today,
              last_modified_by: currentUser,
            }
          : income
      );
      setIncomes(updated);
      setIncome(updated);
      setEditingId(null);
    } else {
      // 추가
      const newIncome: Income = {
        id: `income-${Date.now()}`,
        ...formData,
        amount: Number(formData.amount),
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
      };
      const updated = [...incomes, newIncome];
      setIncomes(updated);
      setIncome(updated);
    }

    // 폼 초기화
    setFormData({
      source: '',
      amount: '',
      owner: 'joint',
      category: 'salary',
      currency: 'KRW',
      period: 'monthly',
    });
    setIsFormOpen(false);
  };

  const handleEdit = (income: Income) => {
    setFormData({
      source: income.source,
      amount: String(income.amount),
      owner: income.owner,
      category: income.category,
      currency: income.currency,
      period: income.period,
    });
    setEditingId(income.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      const updated = incomes.filter((income) => income.id !== id);
      setIncomes(updated);
      setIncome(updated);
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({
      source: '',
      amount: '',
      owner: 'joint',
      category: 'salary',
      currency: 'KRW',
      period: 'monthly',
    });
  };

  const totalIncome = useMemo(() => {
    return filteredIncomes.reduce((sum, income) => sum + income.amount, 0);
  }, [filteredIncomes]);

  const incomeColumns: Column<Income>[] = [
    { key: 'source', label: '수입원', sortable: true },
    {
      key: 'category',
      label: '카테고리',
      sortable: true,
      render: (value) => {
        const labels: Record<string, string> = {
          salary: '급여',
          bonus: '보너스',
          investment: '투자',
          other: '기타',
        };
        return labels[value] || value;
      },
    },
    {
      key: 'amount',
      label: '금액',
      sortable: true,
      render: (value) => `${new Intl.NumberFormat('ko-KR').format(value)}원`,
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
      key: 'period',
      label: '주기',
      sortable: true,
      render: (value) => {
        const labels: Record<string, string> = {
          monthly: '월간',
          yearly: '연간',
          'one-time': '일회성',
        };
        return labels[value] || value;
      },
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
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            수정
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
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
            <h1 className="text-2xl font-bold text-gray-900">수입</h1>
            <button
              onClick={() => setIsFormOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              + 수입 추가
            </button>
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">총 수입</div>
              <div className="text-2xl font-bold text-green-600">
                {new Intl.NumberFormat('ko-KR').format(totalIncome)}원
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">수입 항목 수</div>
              <div className="text-2xl font-bold text-gray-900">{filteredIncomes.length}개</div>
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">평균 수입</div>
              <div className="text-2xl font-bold text-gray-900">
                {filteredIncomes.length > 0
                  ? `${new Intl.NumberFormat('ko-KR').format(Math.round(totalIncome / filteredIncomes.length))}원`
                  : '0원'}
              </div>
            </div>
          </div>

          {/* 입력 폼 모달 */}
          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {editingId ? '수입 수정' : '수입 추가'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      수입원 *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="예: 급여, 보너스 등"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      금액 *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
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
                        카테고리 *
                      </label>
                      <select
                        required
                        value={formData.category}
                        onChange={(e) =>
                          setFormData({ ...formData, category: e.target.value as any })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="salary">급여</option>
                        <option value="bonus">보너스</option>
                        <option value="investment">투자</option>
                        <option value="other">기타</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        주기 *
                      </label>
                      <select
                        required
                        value={formData.period}
                        onChange={(e) =>
                          setFormData({ ...formData, period: e.target.value as any })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="monthly">월간</option>
                        <option value="yearly">연간</option>
                        <option value="one-time">일회성</option>
                      </select>
                    </div>
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

          {/* 수입 목록 테이블 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">수입 목록</h2>
            </div>
            <Table data={filteredIncomes} columns={incomeColumns} searchable />
          </div>
        </div>
      </div>
    </div>
  );
}
