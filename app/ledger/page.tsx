'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import { LedgerEntry, LedgerType, LedgerCategory, DashboardState } from '@/types';
import { getDashboardState, getLedgerEntries, setLedgerEntries, syncFromFirebase } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';

// 카테고리 한글명 매핑
const categoryLabels: Record<LedgerCategory, string> = {
  // 고정비
  transportation: '교통비',
  management_fee: '관리비',
  communication: '통신비',
  insurance: '보험',
  ott: 'OTT',
  interest: '전세 이자',
  other_fixed: '기타 고정비',
  // 변동비
  food: '식비',
  shopping_clothing: '쇼핑/의류',
  shopping_beauty: '쇼핑/미용',
  shopping_other: '쇼핑/기타',
  coffee: '커피',
  books: '도서',
  exhibition: '전시회',
  other_variable: '기타 변동비',
  // 수입
  salary: '월급',
  stock_profit: '주식 수익',
  other_income: '기타 수입',
  // 저축
  pension_insurance: '연금 저축 보험',
  savings: '적금',
  travel_savings: '여행 적금',
  isa: 'ISA',
  housing_subscription: '주택 청약',
  other_savings: '기타 저축',
};

// 타입별 카테고리 그룹
const categoriesByType: Record<LedgerType, LedgerCategory[]> = {
  expense_fixed: ['transportation', 'management_fee', 'communication', 'insurance', 'ott', 'interest', 'other_fixed'],
  expense_variable: ['food', 'shopping_clothing', 'shopping_beauty', 'shopping_other', 'coffee', 'books', 'exhibition', 'other_variable'],
  income: ['salary', 'stock_profit', 'other_income'],
  savings: ['pension_insurance', 'savings', 'travel_savings', 'isa', 'housing_subscription', 'other_savings'],
};

// 결제 수단 한글명
const paymentMethodLabels: Record<string, string> = {
  cash: '현금',
  card: '카드',
  transfer: '계좌이체',
  other: '기타',
};

// 파이 차트 색상
const COLORS = ['#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16'];

export default function LedgerPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [entries, setEntriesState] = useState<LedgerEntry[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: '',
    type: 'expense_fixed' as LedgerType,
    category: 'transportation' as LedgerCategory,
    subcategory: '',
    amount: '',
    payment_method: 'cash' as 'cash' | 'card' | 'transfer' | 'other',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    notes: '',
    is_fixed: false,
  });

  useEffect(() => {
    if (isAuthenticated !== true) return;
    
    // Firebase에서 데이터 동기화 후 로컬 데이터 로드
    const loadData = async () => {
      await syncFromFirebase();
      
      const dashboardState = getDashboardState();
      setState(dashboardState);
      setEntriesState(getLedgerEntries());
      
      // 기준월 변경 시 고정비 자동 반복 로직 실행
      checkAndCreateFixedEntries(dashboardState.baseMonth);
    };
    
    loadData();
  }, [isAuthenticated]);

  // DashboardState 변경 감지 (TopBar에서 변경 시)
  useEffect(() => {
    const handleStateChange = () => {
      const newState = getDashboardState();
      setState(newState);
      
      // 기준월이 변경되면 고정비 자동 반복 로직 실행
      if (newState) {
        checkAndCreateFixedEntries(newState.baseMonth);
      }
    };

    window.addEventListener('dashboardStateChanged', handleStateChange);
    window.addEventListener('storage', handleStateChange);

    return () => {
      window.removeEventListener('dashboardStateChanged', handleStateChange);
      window.removeEventListener('storage', handleStateChange);
    };
  }, []);

  // 고정비 자동 반복 로직
  const checkAndCreateFixedEntries = (targetMonth: string) => {
    if (!targetMonth) return;
    
    const allEntries = getLedgerEntries();
    const targetYear = parseInt(targetMonth.split('-')[0]);
    const targetMonthNum = parseInt(targetMonth.split('-')[1]);
    
    // 해당 월의 기존 항목들
    const existingEntries = allEntries.filter(e => e.month === targetMonth);
    const existingFixedIds = new Set(existingEntries.filter(e => e.is_fixed).map(e => e.id));
    
    // 이전 달의 고정비 항목들 찾기
    const prevMonth = new Date(targetYear, targetMonthNum - 2, 1);
    const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthEntries = allEntries.filter(e => e.month === prevMonthStr && e.is_fixed);
    
    // 이전 달 고정비를 현재 달로 복사 (아직 없는 경우만)
    const newEntries: LedgerEntry[] = [];
    prevMonthEntries.forEach(prevEntry => {
      // 이미 존재하는지 확인 (같은 카테고리, 같은 금액, 같은 소유자)
      const exists = existingEntries.some(e => 
        e.is_fixed && 
        e.category === prevEntry.category &&
        e.amount === prevEntry.amount &&
        e.owner === prevEntry.owner &&
        e.subcategory === prevEntry.subcategory
      );
      
      if (!exists) {
        const currentUser: 'husband' | 'wife' = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
        const today = new Date().toISOString().split('T')[0];
        
        // 날짜를 해당 월의 첫째 날로 설정
        const entryDate = `${targetMonth}-01`;
        
        const newEntry: LedgerEntry = {
          ...prevEntry,
          id: `ledger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: entryDate,
          month: targetMonth,
          as_of_date: today,
          last_modified_by: currentUser,
        };
        newEntries.push(newEntry);
      }
    });
    
    if (newEntries.length > 0) {
      const updated = [...allEntries, ...newEntries];
      setEntriesState(updated);
      setLedgerEntries(updated);
    }
  };

  // 기준월 변경 시 고정비 자동 반복
  useEffect(() => {
    if (state?.baseMonth) {
      checkAndCreateFixedEntries(state.baseMonth);
    }
  }, [state?.baseMonth]);

  // 현재 기준월의 항목들 필터링
  const currentMonthEntries = useMemo(() => {
    if (!state?.baseMonth) return [];
    return entries.filter(e => e.month === state.baseMonth);
  }, [entries, state?.baseMonth]);

  // 타입별로 그룹화
  const entriesByType = useMemo(() => {
    const grouped: Record<LedgerType, LedgerEntry[]> = {
      expense_fixed: [],
      expense_variable: [],
      income: [],
      savings: [],
    };
    
    currentMonthEntries.forEach(entry => {
      if (grouped[entry.type]) {
        grouped[entry.type].push(entry);
      }
    });
    
    return grouped;
  }, [currentMonthEntries]);

  // 타입별 총합 계산
  const totalsByType = useMemo(() => {
    return {
      expense_fixed: entriesByType.expense_fixed.reduce((sum, e) => sum + e.amount, 0),
      expense_variable: entriesByType.expense_variable.reduce((sum, e) => sum + e.amount, 0),
      income: entriesByType.income.reduce((sum, e) => sum + e.amount, 0),
      savings: entriesByType.savings.reduce((sum, e) => sum + e.amount, 0),
    };
  }, [entriesByType]);

  // 전월 대비 비교
  const previousMonthComparison = useMemo(() => {
    if (!state?.baseMonth) return null;
    
    const targetYear = parseInt(state.baseMonth.split('-')[0]);
    const targetMonthNum = parseInt(state.baseMonth.split('-')[1]);
    const prevMonth = new Date(targetYear, targetMonthNum - 2, 1);
    const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    
    const prevMonthEntries = entries.filter(e => e.month === prevMonthStr);
    const prevTotalExpense = prevMonthEntries
      .filter(e => e.type === 'expense_fixed' || e.type === 'expense_variable')
      .reduce((sum, e) => sum + e.amount, 0);
    
    const currentTotalExpense = totalsByType.expense_fixed + totalsByType.expense_variable;
    const difference = currentTotalExpense - prevTotalExpense;
    
    return {
      prevTotal: prevTotalExpense,
      currentTotal: currentTotalExpense,
      difference,
    };
  }, [state?.baseMonth, entries, totalsByType]);

  // 파이 차트 데이터 (지출 카테고리별)
  const pieChartData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    
    [...entriesByType.expense_fixed, ...entriesByType.expense_variable].forEach(entry => {
      const categoryName = categoryLabels[entry.category];
      categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + entry.amount;
    });
    
    return Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [entriesByType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const currentUser: 'husband' | 'wife' = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];
    const targetMonth = state?.baseMonth || new Date().toISOString().slice(0, 7);

    if (editingId) {
      // 수정
      const allEntries = getLedgerEntries();
      const existingEntry = allEntries.find(e => e.id === editingId);
      if (!existingEntry) return;
      
      const updatedEntry: LedgerEntry = {
        ...existingEntry,
        date: formData.date,
        type: formData.type,
        category: formData.category,
        subcategory: formData.subcategory || undefined,
        amount: Number(formData.amount),
        payment_method: formData.payment_method,
        owner: formData.owner,
        notes: formData.notes || undefined,
        is_fixed: formData.is_fixed,
        month: formData.date.slice(0, 7),
        as_of_date: today,
        last_modified_by: currentUser,
      };
      
      const updated = allEntries.map(e => e.id === editingId ? updatedEntry : e);
      setEntriesState(updated);
      setLedgerEntries(updated);
      setIsFormOpen(false);
      setEditingId(null);
      resetForm();
    } else {
      // 추가
      const newEntry: LedgerEntry = {
        id: `ledger-${Date.now()}`,
        date: formData.date,
        type: formData.type,
        category: formData.category,
        subcategory: formData.subcategory || undefined,
        amount: Number(formData.amount),
        payment_method: formData.payment_method,
        owner: formData.owner,
        notes: formData.notes || undefined,
        is_fixed: formData.is_fixed,
        month: formData.date.slice(0, 7),
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
      };
      
      const allEntries = getLedgerEntries();
      const updated = [...allEntries, newEntry];
      setEntriesState(updated);
      setLedgerEntries(updated);
      setIsFormOpen(false);
      resetForm();
    }
  };

  const resetForm = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      date: today,
      type: 'expense_fixed',
      category: 'transportation',
      subcategory: '',
      amount: '',
      payment_method: 'cash',
      owner: 'joint',
      notes: '',
      is_fixed: false,
    });
  };

  const handleEdit = (entry: LedgerEntry) => {
    setFormData({
      date: entry.date,
      type: entry.type,
      category: entry.category,
      subcategory: entry.subcategory || '',
      amount: String(entry.amount),
      payment_method: entry.payment_method,
      owner: entry.owner,
      notes: entry.notes || '',
      is_fixed: entry.is_fixed,
    });
    setEditingId(entry.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      const allEntries = getLedgerEntries();
      const updated = allEntries.filter(e => e.id !== id);
      setEntriesState(updated);
      setLedgerEntries(updated);
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    resetForm();
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

  const monthLabel = state.baseMonth ? `${parseInt(state.baseMonth.split('-')[1])}월 결산` : '결산';

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      <Navigation />
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{monthLabel}</h1>
            <button
              onClick={() => {
                resetForm();
                const today = new Date().toISOString().split('T')[0];
                setFormData(prev => ({ ...prev, date: today }));
                setIsFormOpen(true);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              + 항목 추가
            </button>
          </div>

          <div className="grid grid-cols-12 gap-4">
            {/* 4개 컬럼: 고정비, 변동비, 수입, 저축 */}
            <div className="col-span-8 grid grid-cols-4 gap-4">
              {/* 고정비 */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">고정비</h2>
                <div className="space-y-2 mb-3">
                  {entriesByType.expense_fixed.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {categoryLabels[entry.category]}
                          {entry.subcategory && ` (${entry.subcategory})`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {paymentMethodLabels[entry.payment_method]} · {entry.owner === 'husband' ? '남편' : entry.owner === 'wife' ? '아내' : '공동'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900">
                          {new Intl.NumberFormat('ko-KR').format(entry.amount)}원
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">총합</span>
                    <span className="font-bold text-gray-900">
                      {new Intl.NumberFormat('ko-KR').format(totalsByType.expense_fixed)}원
                    </span>
                  </div>
                </div>
              </div>

              {/* 변동비 */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">변동비</h2>
                <div className="space-y-2 mb-3">
                  {entriesByType.expense_variable.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {categoryLabels[entry.category]}
                          {entry.subcategory && ` (${entry.subcategory})`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {paymentMethodLabels[entry.payment_method]} · {entry.owner === 'husband' ? '남편' : entry.owner === 'wife' ? '아내' : '공동'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900">
                          {new Intl.NumberFormat('ko-KR').format(entry.amount)}원
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">총합</span>
                    <span className="font-bold text-gray-900">
                      {new Intl.NumberFormat('ko-KR').format(totalsByType.expense_variable)}원
                    </span>
                  </div>
                </div>
              </div>

              {/* 수입 */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">수입</h2>
                <div className="space-y-2 mb-3">
                  {entriesByType.income.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {categoryLabels[entry.category]}
                          {entry.subcategory && ` (${entry.subcategory})`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {entry.owner === 'husband' ? '남편' : entry.owner === 'wife' ? '아내' : '공동'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900">
                          {new Intl.NumberFormat('ko-KR').format(entry.amount)}원
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">총합</span>
                    <span className="font-bold text-gray-900">
                      {new Intl.NumberFormat('ko-KR').format(totalsByType.income)}원
                    </span>
                  </div>
                </div>
              </div>

              {/* 저축 */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">저축</h2>
                <div className="space-y-2 mb-3">
                  {entriesByType.savings.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {categoryLabels[entry.category]}
                          {entry.subcategory && ` (${entry.subcategory})`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {entry.owner === 'husband' ? '남편' : entry.owner === 'wife' ? '아내' : '공동'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900">
                          {new Intl.NumberFormat('ko-KR').format(entry.amount)}원
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">총합</span>
                    <span className="font-bold text-gray-900">
                      {new Intl.NumberFormat('ko-KR').format(totalsByType.savings)}원
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 우측: 지출 평가 + 파이 차트 */}
            <div className="col-span-4 space-y-4">
              {/* 지출 평가 */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">지출평가</h2>
                {previousMonthComparison ? (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">
                      지난 달 지출: {new Intl.NumberFormat('ko-KR').format(previousMonthComparison.prevTotal)}원
                    </div>
                    <div className="text-sm text-gray-600">
                      이번 달 지출: {new Intl.NumberFormat('ko-KR').format(previousMonthComparison.currentTotal)}원
                    </div>
                    <div className="text-sm font-medium">
                      지난 달 보다{' '}
                      <span className={previousMonthComparison.difference >= 0 ? 'text-red-600' : 'text-green-600'}>
                        {Math.abs(previousMonthComparison.difference).toLocaleString()}원{' '}
                        {previousMonthComparison.difference >= 0 ? '더 썼어요' : '아꼈어요'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">전월 데이터가 없습니다.</div>
                )}
              </div>

              {/* 파이 차트 */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">지출 분포</h2>
                {pieChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => new Intl.NumberFormat('ko-KR').format(value) + '원'}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-400">
                    데이터가 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 입력 폼 모달 */}
          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {editingId ? '항목 수정' : '항목 추가'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">날짜 *</label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">유형 *</label>
                    <select
                      required
                      value={formData.type}
                      onChange={(e) => {
                        const newType = e.target.value as LedgerType;
                        setFormData({
                          ...formData,
                          type: newType,
                          category: categoriesByType[newType][0],
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="expense_fixed">고정비</option>
                      <option value="expense_variable">변동비</option>
                      <option value="income">수입</option>
                      <option value="savings">저축</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">카테고리 *</label>
                    <select
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as LedgerCategory })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {categoriesByType[formData.type].map(cat => (
                        <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">하위 카테고리</label>
                    <input
                      type="text"
                      value={formData.subcategory}
                      onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="예: ○○ 적금"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">금액 *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="1"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="금액을 입력하세요"
                    />
                  </div>
                  {(formData.type === 'expense_fixed' || formData.type === 'expense_variable') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">결제 수단 *</label>
                      <select
                        required
                        value={formData.payment_method}
                        onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as 'cash' | 'card' | 'transfer' | 'other' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="cash">현금</option>
                        <option value="card">카드</option>
                        <option value="transfer">계좌이체</option>
                        <option value="other">기타</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">소유자 *</label>
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
                  {(formData.type === 'expense_fixed' || formData.type === 'expense_variable') && (
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_fixed"
                        checked={formData.is_fixed}
                        onChange={(e) => setFormData({ ...formData, is_fixed: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="is_fixed" className="ml-2 block text-sm text-gray-700">
                        고정비로 설정 (다음 달 자동 반복)
                      </label>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
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
        </div>
      </div>
    </div>
  );
}
