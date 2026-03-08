'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import { Salary, DashboardState } from '@/types';
import { getDashboardState, getSalaries, setSalaries, syncFromFirebase } from '@/lib/store';
import { getExchangeRates } from '@/lib/exchangeRate';
import { useAuth } from '@/hooks/useAuth';
import NaverSalaryComparisonModal from '@/components/NaverSalaryComparisonModal';

// 금액 포맷팅 함수 (1억 넘으면 억 단위, 아니면 만원 단위)
const formatAmountLabel = (amount: number): string => {
  if (amount >= 100000000) {
    // 1억 이상: 억 단위로 표시 (소수점 2자리, 예: 1.80억)
    const eok = amount / 100000000;
    return `${eok.toFixed(2)}억`;
  } else {
    // 1억 미만: 만원 단위로 올림 (예: 5550만원) - 일반 숫자로 표시
    const man = Math.ceil(amount / 10000);
    return `${man}만원`;
  }
};

// CustomLabel은 SalaryPage 안에서 정의 (yearlyIncomeData 접근 필요)

export default function SalaryPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [salaries, setSalariesState] = useState<Salary[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    year: new Date().getFullYear().toString(),
    amount: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    currency: 'KRW',
    yearsOfExperience: '',
    notes: '',
  });

  useEffect(() => {
    if (isAuthenticated !== true) return;
    
    // Firebase에서 데이터 동기화 후 로컬 데이터 로드
    const loadData = async () => {
      await syncFromFirebase();
      
      const dashboardState = getDashboardState();
      setState(dashboardState);
      setSalariesState(getSalaries());
      
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

  const filteredSalaries = useMemo(() => {
    if (!state) return [];
    // 연봉 페이지에서는 합산 옵션 없음 - 남편과 아내만 필터링
    // scope가 'combined'일 경우 자동으로 남편 또는 아내로 변경
    const effectiveScope = state.scope === 'combined' ? 'husband' : state.scope;
    return salaries.filter((salary) => salary.owner === effectiveScope || salary.owner === 'joint');
  }, [salaries, state]);

  // 생애 총 소득 계산
  const totalLifetimeIncome = useMemo(() => {
    if (!exchangeRates) return 0;
    return Math.floor(filteredSalaries.reduce((sum, salary) => {
      if (salary.currency === 'KRW') {
        return sum + salary.amount;
      } else if (salary.currency === 'USD') {
        return sum + salary.amount * exchangeRates.USD_TO_KRW;
      } else if (salary.currency === 'EUR') {
        return sum + salary.amount * exchangeRates.EUR_TO_KRW;
      }
      return sum + salary.amount;
    }, 0));
  }, [filteredSalaries, exchangeRates]);

  // 최근 소득 (가장 최근 입력된 연간 소득값)
  const recentIncome = useMemo(() => {
    if (filteredSalaries.length === 0) return null;
    const sorted = [...filteredSalaries].sort((a, b) => {
      // year 기준 내림차순, 그 다음 as_of_date 기준 내림차순
      if (a.year !== b.year) {
        return b.year.localeCompare(a.year);
      }
      return b.as_of_date.localeCompare(a.as_of_date);
    });
    const latest = sorted[0];
    if (!exchangeRates) return { amount: latest.amount, currency: latest.currency };
    
    let krwAmount = latest.amount;
    if (latest.currency === 'USD') {
      krwAmount = latest.amount * exchangeRates.USD_TO_KRW;
    } else if (latest.currency === 'EUR') {
      krwAmount = latest.amount * exchangeRates.EUR_TO_KRW;
    }
    
    return {
      amount: Math.floor(krwAmount),
      originalAmount: latest.amount,
      currency: latest.currency,
      year: latest.year,
    };
  }, [filteredSalaries, exchangeRates]);

  // 연간 총소득 차트 데이터 (연도별로 그룹화)
  const yearlyIncomeData = useMemo(() => {
    if (!exchangeRates || filteredSalaries.length === 0) return [];
    
    // 연도별로 그룹화
    const groupedByYear = filteredSalaries.reduce((acc, salary) => {
      if (!acc[salary.year]) {
        acc[salary.year] = [];
      }
      acc[salary.year].push(salary);
      return acc;
    }, {} as Record<string, Salary[]>);
    
    // 연도별 총액 계산
    const yearlyTotals = Object.entries(groupedByYear).map(([year, yearSalaries]) => {
      const total = yearSalaries.reduce((sum, salary) => {
        if (salary.currency === 'KRW') {
          return sum + salary.amount;
        } else if (salary.currency === 'USD') {
          return sum + salary.amount * exchangeRates.USD_TO_KRW;
        } else if (salary.currency === 'EUR') {
          return sum + salary.amount * exchangeRates.EUR_TO_KRW;
        }
        return sum + salary.amount;
      }, 0);
      
      return {
        year,
        amount: Math.floor(total),
      };
    });
    
    // 연도순으로 정렬
    const sorted = yearlyTotals.sort((a, b) => a.year.localeCompare(b.year));
    
    // 전년비 상승율 계산
    return sorted.map((item, index) => {
      let changePercent: number | null = null;
      if (index > 0) {
        const prevAmount = sorted[index - 1].amount;
        if (prevAmount > 0) {
          changePercent = ((item.amount - prevAmount) / prevAmount) * 100;
        }
      }
      
      return {
        ...item,
        changePercent,
      };
    });
  }, [filteredSalaries, exchangeRates]);

  // 최근 소득의 전년비 상승률 계산
  const recentIncomeChangePercent = useMemo(() => {
    if (!recentIncome || yearlyIncomeData.length === 0) return null;
    const currentYearData = yearlyIncomeData.find(item => item.year === recentIncome.year);
    return currentYearData ? currentYearData.changePercent : null;
  }, [recentIncome, yearlyIncomeData]);

  // 커스텀 라벨 렌더링 함수 - yearlyIncomeData 접근 가능
  const renderCustomLabel = (props: any) => {
    if (!props) return null;
    
    const { x, y, width, index, value } = props;
    
    // index를 사용해서 yearlyIncomeData에서 changePercent 가져오기
    const dataItem = yearlyIncomeData[index];
    const changePercent = dataItem ? dataItem.changePercent : null;
    
    const amount = value;
    if (!amount || amount === 0) return null;
    
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return null;
    
    const amountLabel = formatAmountLabel(numAmount);
    const hasChangePercent = changePercent !== null && changePercent !== undefined && !isNaN(Number(changePercent)) && isFinite(Number(changePercent));
    
    const labelX = x + width / 2;
    
    return (
      <g>
        {/* 금액 라벨: Bold, 흰색 */}
        <text
          x={labelX}
          y={y + 20}
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="14"
          fontWeight="bold"
        >
          {amountLabel}
        </text>
        {/* 전년 대비 상승율: 금액 바로 밑 */}
        {hasChangePercent && (
          <text
            x={labelX}
            y={y + 36}
            textAnchor="middle"
            fill="rgba(255,255,255,0.9)"
            fontSize="11"
            fontWeight="normal"
          >
            ({changePercent >= 0 ? '+' : ''}{Number(changePercent).toFixed(0)}%)
          </text>
        )}
      </g>
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const currentUser = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];

    if (editingId) {
      // 수정
      const updated = salaries.map((salary) =>
        salary.id === editingId
          ? {
              ...salary,
              year: formData.year,
              amount: Number(formData.amount),
              owner: formData.owner,
              currency: formData.currency,
              yearsOfExperience: formData.yearsOfExperience ? Number(formData.yearsOfExperience) : undefined,
              notes: formData.notes || undefined,
              as_of_date: today,
              last_modified_by: currentUser,
            }
          : salary
      );
      setSalariesState(updated);
      setSalaries(updated);
      setIsFormOpen(false);
      setEditingId(null);
      setFormData({
        year: new Date().getFullYear().toString(),
        amount: '',
        owner: 'joint',
        currency: 'KRW',
        yearsOfExperience: '',
        notes: '',
      });
    } else {
      // 추가
      const newSalary: Salary = {
        id: `salary-${Date.now()}`,
        year: formData.year,
        amount: Number(formData.amount),
        owner: formData.owner,
        currency: formData.currency,
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
        yearsOfExperience: formData.yearsOfExperience ? Number(formData.yearsOfExperience) : undefined,
        notes: formData.notes || undefined,
      };
      const updated = [...salaries, newSalary];
      setSalariesState(updated);
      setSalaries(updated);
      setIsFormOpen(false);
      setFormData({
        year: new Date().getFullYear().toString(),
        amount: '',
        owner: 'joint',
        currency: 'KRW',
        yearsOfExperience: '',
        notes: '',
      });
    }
  };

  const handleEdit = (salary: Salary) => {
    setFormData({
      year: salary.year,
      amount: String(salary.amount),
      owner: salary.owner,
      currency: salary.currency,
      yearsOfExperience: salary.yearsOfExperience ? String(salary.yearsOfExperience) : '',
      notes: salary.notes || '',
    });
    setEditingId(salary.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      const updated = salaries.filter((salary) => salary.id !== id);
      setSalariesState(updated);
      setSalaries(updated);
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({
      year: new Date().getFullYear().toString(),
      amount: '',
      owner: 'joint',
      currency: 'KRW',
      notes: '',
    });
  };

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
            <h1 className="text-2xl font-bold text-gray-900">연봉</h1>
            <button
              onClick={() => {
                setFormData({
                  year: new Date().getFullYear().toString(),
                  amount: '',
                  owner: 'joint',
                  currency: 'KRW',
                  yearsOfExperience: '',
                  notes: '',
                });
                setIsFormOpen(true);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              + 연봉 추가
            </button>
          </div>

          {/* 최상단: 생애 총 소득, 최근 소득 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 md:col-span-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-sm text-gray-600 mb-1">생애 총 소득</div>
              <div className="text-3xl font-bold text-gray-900">
                {new Intl.NumberFormat('ko-KR').format(totalLifetimeIncome)}원
              </div>
            </div>
            <div className="col-span-12 md:col-span-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-sm text-gray-600 mb-1">최근 소득</div>
              {recentIncome ? (
                <div>
                  <div className="text-3xl font-bold text-gray-900">
                    {new Intl.NumberFormat('ko-KR').format(recentIncome.amount)}원
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {recentIncome.year}년
                    {recentIncomeChangePercent !== null && recentIncomeChangePercent !== undefined && !isNaN(Number(recentIncomeChangePercent)) && isFinite(Number(recentIncomeChangePercent)) && (
                      <span className="ml-2">
                        ({recentIncomeChangePercent >= 0 ? '+' : ''}{Number(recentIncomeChangePercent).toFixed(0)}% 상승)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-2xl font-bold text-gray-400">-</div>
              )}
            </div>
          </div>

          {/* 연간 총소득 막대그래프 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">연간 총소득</h2>
            {yearlyIncomeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={yearlyIncomeData} margin={{ top: 60, right: 30, left: 60, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="year" 
                    tick={{ fill: '#6B7280' }}
                    label={{ value: '연도', position: 'bottom', offset: 10, style: { textAnchor: 'middle', fill: '#6B7280' } }}
                  />
                  <YAxis 
                    width={80}
                    tick={{ fill: '#6B7280' }}
                    label={{ value: '금액 (원)', angle: -90, position: 'insideLeft', offset: -10, style: { textAnchor: 'middle', fill: '#6B7280' } }}
                    tickFormatter={(value) => {
                      if (value >= 100000000) {
                        return `${(value / 100000000).toFixed(1)}억`;
                      } else if (value >= 10000) {
                        return `${(value / 10000).toFixed(0)}만`;
                      }
                      return value.toString();
                    }}
                  />
                  <Tooltip
                    formatter={(value: number) => new Intl.NumberFormat('ko-KR').format(value) + '원'}
                    labelStyle={{ color: '#374151' }}
                  />
                  <Bar dataKey="amount" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                    <LabelList 
                      dataKey="amount"
                      position="insideTop"
                      content={renderCustomLabel}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-96 text-gray-400">
                {!exchangeRates ? '환율 정보를 불러오는 중...' : '데이터가 없습니다. 연봉을 추가해주세요.'}
              </div>
            )}
          </div>

          {/* 입력 폼 모달 */}
          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {editingId ? '연봉 수정' : '연봉 추가'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      연도 *
                    </label>
                    <input
                      type="number"
                      required
                      min="2000"
                      max="2100"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="예: 2024"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      연봉 금액 *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="금액을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      통화 *
                    </label>
                    <select
                      required
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="KRW">KRW (원)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      소유자 *
                    </label>
                    <select
                      required
                      value={formData.owner}
                      onChange={(e) => setFormData({ ...formData, owner: e.target.value as 'husband' | 'wife' | 'joint' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="husband">남편</option>
                      <option value="wife">아내</option>
                      <option value="joint">공동</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      연차 (년)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={formData.yearsOfExperience}
                      onChange={(e) => setFormData({ ...formData, yearsOfExperience: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="예: 5 (선택사항)"
                    />
                    <p className="mt-1 text-xs text-gray-500">네이버 연봉 비교에 사용됩니다</p>
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
                  <div className="flex gap-3 pt-4">
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

          {/* 연봉 목록 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">연봉 목록</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">연도</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">금액</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상승율</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">연차</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">소유자</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSalaries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        연봉 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    [...filteredSalaries].sort((a, b) => {
                      if (a.year !== b.year) {
                        return b.year.localeCompare(a.year);
                      }
                      return b.as_of_date.localeCompare(a.as_of_date);
                    }).map((salary) => {
                      let displayAmount = salary.amount;
                      if (exchangeRates) {
                        if (salary.currency === 'USD') {
                          displayAmount = salary.amount * exchangeRates.USD_TO_KRW;
                        } else if (salary.currency === 'EUR') {
                          displayAmount = salary.amount * exchangeRates.EUR_TO_KRW;
                        }
                      }
                      
                      // 해당 연도의 상승율 찾기
                      const yearData = yearlyIncomeData.find(item => item.year === salary.year);
                      const changePercent = yearData ? yearData.changePercent : null;
                      const hasChangePercent = changePercent !== null && changePercent !== undefined && !isNaN(Number(changePercent)) && isFinite(Number(changePercent));
                      
                      return (
                        <tr key={salary.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{salary.year}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {new Intl.NumberFormat('ko-KR').format(Math.floor(displayAmount))}원
                            {salary.currency !== 'KRW' && (
                              <span className="text-xs text-gray-500 ml-1">
                                ({salary.currency === 'USD' ? '$' : '€'}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(salary.amount)})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {hasChangePercent ? (
                              <span className={changePercent >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {changePercent >= 0 ? '+' : ''}{Number(changePercent).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {salary.yearsOfExperience ? `${salary.yearsOfExperience}년차` : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {salary.owner === 'husband' ? '남편' : salary.owner === 'wife' ? '아내' : '공동'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{salary.notes || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(salary)}
                                className="px-3 py-1 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleDelete(salary.id)}
                                className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 transition-colors"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 네이버 연봉 비교 CTA */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-center">
                <button
                  onClick={() => setIsComparisonModalOpen(true)}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-lg"
                >
                  네이버 연봉 비교
                </button>
                <p className="mt-2 text-sm text-gray-500">
                  조직별 연봉 분포(참고용)와 내 위치를 확인
                </p>
              </div>
            </div>
          </div>

          {/* 네이버 연봉 비교 모달 */}
          <NaverSalaryComparisonModal
            isOpen={isComparisonModalOpen}
            onClose={() => setIsComparisonModalOpen(false)}
            salaries={filteredSalaries}
            exchangeRates={exchangeRates}
          />
        </div>
      </div>
    </div>
  );
}
