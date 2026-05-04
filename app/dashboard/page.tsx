'use client';

import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LabelList } from 'recharts';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { Asset, DashboardState, Scope, Liability } from '@/types';
import { getDashboardState, getAssets, getLiabilities, syncFromFirebase } from '@/lib/store';
import { getExchangeRates } from '@/lib/exchangeRate';
import { useAuth } from '@/hooks/useAuth';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];


export default function DashboardPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated !== true) return;
    
    const loadData = async () => {
      try {
        await syncFromFirebase();
        
        const dashboardState = getDashboardState();
        setState(dashboardState);
        setAssets(getAssets());
        setLiabilities(getLiabilities());
        
        getExchangeRates().then((rates) => {
          setExchangeRates(rates);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };
    
    loadData();
  }, [isAuthenticated]);

  // category === 'other' 인 자산은 기타 자산 (자동차, RSU unvested 등)
  const isOtherAsset = (asset: Asset) => asset.category === 'other';

  // DashboardState 변경 감지 (TopBar에서 변경 시)
  useEffect(() => {
    if (isAuthenticated !== true) return;
    
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
  }, [isAuthenticated]);

  const filteredAssets = useMemo(() => {
    if (!state) return [];
    if (state.scope === 'combined') return assets;
    return assets.filter((asset) => asset.owner === state.scope || asset.owner === 'joint');
  }, [assets, state]);

  const filteredLiabilities = useMemo(() => {
    if (!state) return [];
    if (state.scope === 'combined') return liabilities;
    return liabilities.filter((liability) => liability.owner === state.scope || liability.owner === 'joint');
  }, [liabilities, state]);

  // 총자산 (category=other 제외)
  const totalAssets = useMemo(() => {
    if (!exchangeRates) return 0;
    return Math.floor(filteredAssets.reduce((sum, asset) => {
      if (isOtherAsset(asset)) return sum;
      if (asset.currency === 'KRW') return sum + asset.amount;
      if (asset.currency === 'USD') return sum + asset.amount * exchangeRates.USD_TO_KRW;
      if (asset.currency === 'EUR') return sum + asset.amount * exchangeRates.EUR_TO_KRW;
      return sum + asset.amount;
    }, 0));
  }, [filteredAssets, exchangeRates]);

  // 기타 자산 (category=other: 자동차, RSU unvested 등)
  const otherAssets = useMemo(() => {
    if (!exchangeRates) return 0;
    return Math.floor(filteredAssets.reduce((sum, asset) => {
      if (!isOtherAsset(asset)) return sum;
      if (asset.currency === 'KRW') return sum + asset.amount;
      if (asset.currency === 'USD') return sum + asset.amount * exchangeRates.USD_TO_KRW;
      if (asset.currency === 'EUR') return sum + asset.amount * exchangeRates.EUR_TO_KRW;
      return sum + asset.amount;
    }, 0));
  }, [filteredAssets, exchangeRates]);

  const totalLiabilities = useMemo(() => {
    if (!exchangeRates) return 0;
    return Math.floor(filteredLiabilities.reduce((sum, liability) => {
      if (liability.currency === 'KRW') {
        return sum + liability.amount;
      } else if (liability.currency === 'USD') {
        return sum + liability.amount * exchangeRates.USD_TO_KRW;
      } else if (liability.currency === 'EUR') {
        return sum + liability.amount * exchangeRates.EUR_TO_KRW;
      }
      return sum + liability.amount;
    }, 0));
  }, [filteredLiabilities, exchangeRates]);

  const netWorth = useMemo(() => {
    return totalAssets - totalLiabilities;
  }, [totalAssets, totalLiabilities]);

  const assetByCategory = useMemo(() => {
    if (!exchangeRates) return [];
    const categoryMap: Record<string, number> = {};
    filteredAssets.forEach((asset) => {
      if (isOtherAsset(asset)) return;
      
      const category = asset.category;
      let krwAmount = asset.amount;
      if (asset.currency === 'USD') {
        krwAmount = asset.amount * exchangeRates.USD_TO_KRW;
      } else if (asset.currency === 'EUR') {
        krwAmount = asset.amount * exchangeRates.EUR_TO_KRW;
      }
      categoryMap[category] = (categoryMap[category] || 0) + krwAmount;
    });
    return Object.entries(categoryMap).map(([name, value]) => ({
      name: getCategoryLabel(name),
      value: Math.floor(value),
    }));
  }, [filteredAssets, exchangeRates]);

  // 커스텀 라벨 컴포넌트 - 색상을 세그먼트와 동일하게, 겹치지 않도록 위치 조정
  const CustomLabel = useMemo(() => {
    return (props: any) => {
      const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
      
      // assetByCategory에서 현재 항목의 인덱스 찾기
      const index = assetByCategory.findIndex((item) => item.name === name);
      const fillColor = index >= 0 ? COLORS[index % COLORS.length] : "#333";
      
      // 각도를 라디안에서 도로 변환
      const RADIAN = Math.PI / 180;
      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
      const x = cx + radius * Math.cos(-midAngle * RADIAN);
      const y = cy + radius * Math.sin(-midAngle * RADIAN);
      
      // 작은 세그먼트는 더 바깥쪽에 배치
      const labelRadius = percent < 0.05 ? outerRadius + 20 : outerRadius + 10;
      const labelX = cx + labelRadius * Math.cos(-midAngle * RADIAN);
      const labelY = cy + labelRadius * Math.sin(-midAngle * RADIAN);
      
      // 라벨이 차트 영역을 벗어나지 않도록 조정
      const adjustedX = Math.max(20, Math.min(labelX, cx * 2 - 20));
      const adjustedY = labelY;
      
      return (
        <text
          x={adjustedX}
          y={adjustedY}
          fill={fillColor}
          textAnchor={adjustedX > cx ? 'start' : 'end'}
          dominantBaseline="central"
          fontSize={12}
          fontWeight="500"
        >
          {`${name} ${(percent * 100).toFixed(0)}%`}
        </text>
      );
    };
  }, [assetByCategory]);

  const netWorthData = useMemo(() => {
    const data = [];
    if (netWorth > 0) {
      data.push({ name: '순자산', value: netWorth });
    }
    if (totalLiabilities > 0) {
      data.push({ name: '부채', value: totalLiabilities });
    }
    return data;
  }, [netWorth, totalLiabilities]);

  const assetTableColumns: Column<Asset>[] = [
    { key: 'name', label: '자산명', sortable: true },
    {
      key: 'category',
      label: '카테고리',
      sortable: true,
      render: (value) => getCategoryLabel(value),
    },
    {
      key: 'amount',
      label: '금액',
      sortable: true,
      render: (value, row) => {
        const currency = row.currency || 'KRW';
        if (!exchangeRates) {
          // 환율이 로드되지 않았을 때 원래 통화로 표시
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
      key: 'as_of_date',
      label: '기준일',
      sortable: true,
    },
  ];

  const liabilityTableColumns: Column<Liability>[] = [
    { key: 'name', label: '부채명', sortable: true },
    {
      key: 'category',
      label: '카테고리',
      sortable: true,
      render: (value) => {
        const labels: Record<string, string> = {
          loan: '대출',
          credit_card: '신용카드',
          mortgage: '주택담보대출',
          other: '기타',
        };
        return labels[value] || value;
      },
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
        
        let krwAmount = value;
        if (currency === 'USD') {
          krwAmount = value * exchangeRates.USD_TO_KRW;
        } else if (currency === 'EUR') {
          krwAmount = value * exchangeRates.EUR_TO_KRW;
        }
        
        return (
          <div>
            <div className="font-semibold text-red-600">
              {new Intl.NumberFormat('ko-KR').format(Math.floor(krwAmount))}원
            </div>
            {currency !== 'KRW' && (
              <div className="text-xs text-gray-500">
                {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''}
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
      render: (value) => getOwnerLabel(value),
    },
    {
      key: 'as_of_date',
      label: '기준일',
      sortable: true,
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <Navigation />
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-red-800 mb-2">오류 발생</h2>
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <Navigation />
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="text-lg text-gray-600 mb-2">로딩 중...</div>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      <Navigation />
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">대시보드</h1>

          {/* KPI Cards */}
          <div className="grid grid-cols-12 gap-4 mb-8">
            <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-blue-500 bg-blue-50 px-2 py-1 rounded-full">자산</span>
              </div>
              <div className="text-sm text-gray-500 mb-1 font-medium">총 자산</div>
              <div className="text-2xl font-bold text-gray-900 tracking-tight">
                {new Intl.NumberFormat('ko-KR').format(totalAssets)}원
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center">
                <span className="inline-block w-1 h-1 bg-gray-300 rounded-full mr-1.5"></span>
                기타 자산 제외
              </div>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${netWorth >= 0 ? 'text-emerald-500 bg-emerald-50' : 'text-rose-500 bg-red-50'}`}>
                  {netWorth >= 0 ? '플러스' : '마이너스'}
                </span>
              </div>
              <div className="text-sm text-gray-500 mb-1 font-medium">순자산</div>
              <div className={`text-2xl font-bold tracking-tight ${netWorth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {new Intl.NumberFormat('ko-KR').format(netWorth)}원
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center">
                <span className="inline-block w-1 h-1 bg-gray-300 rounded-full mr-1.5"></span>
                자산 - 부채
              </div>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-rose-500 bg-red-50 px-2 py-1 rounded-full">부채</span>
              </div>
              <div className="text-sm text-gray-500 mb-1 font-medium">총 부채</div>
              <div className="text-2xl font-bold text-rose-600 tracking-tight">
                {new Intl.NumberFormat('ko-KR').format(totalLiabilities)}원
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center">
                <span className="inline-block w-1 h-1 bg-gray-300 rounded-full mr-1.5"></span>
                상환 필요 금액
              </div>
            </div>

            <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-amber-500 bg-amber-50 px-2 py-1 rounded-full">기타</span>
              </div>
              <div className="text-sm text-gray-500 mb-1 font-medium">기타 자산</div>
              <div className="text-2xl font-bold text-gray-700 tracking-tight">
                {new Intl.NumberFormat('ko-KR').format(otherAssets)}원
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center">
                <span className="inline-block w-1 h-1 bg-gray-300 rounded-full mr-1.5"></span>
                자동차, Unvested RSU 등
              </div>
            </div>
          </div>

          {/* Charts and Tables Row */}
          <div className="grid grid-cols-12 gap-6 mb-8">
            {/* 자산 구성 차트 */}
            <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">자산 구성</h2>
                <div className="text-xs text-gray-400 font-medium">카테고리별 비중</div>
              </div>
              <div className="relative h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetByCategory}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={CustomLabel}
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      fill="#8884d8"
                      dataKey="value"
                      minAngle={1}
                    >
                      {assetByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => new Intl.NumberFormat('ko-KR').format(value) + '원'}
                    />
                    <Legend iconType="circle" verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginTop: '-18px' }}>
                  <span className="text-xs text-gray-400 font-medium">총 자산</span>
                  <span className="text-sm font-bold text-gray-900">
                    {new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(totalAssets)}
                  </span>
                </div>
              </div>
            </div>

            {/* 순자산/부채 차트 */}
            <div className="col-span-12 lg:col-span-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">순자산 vs 부채</h2>
                <div className="text-xs text-gray-400 font-medium">자산 건전성</div>
              </div>
              {netWorthData.length > 0 ? (
                <div className="relative h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={netWorthData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {netWorthData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.name === '순자산' ? '#10B981' : '#F43F5E'}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: number) => new Intl.NumberFormat('ko-KR').format(value) + '원'}
                      />
                      <Legend iconType="circle" verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginTop: '-18px' }}>
                    <span className="text-xs text-gray-400 font-medium">순자산 비율</span>
                    <span className="text-sm font-bold text-emerald-600">
                      {totalAssets > 0 ? ((netWorth / totalAssets) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm italic">
                  표시할 데이터가 없습니다
                </div>
              )}
            </div>

            {/* 갈아타기 위젯 */}
            <div className="col-span-12 lg:col-span-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg border-none p-6 text-white">
              <h2 className="text-lg font-bold mb-6 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
                목표 달성 현황
              </h2>
              <div className="space-y-6">
                <div>
                  <div className="text-blue-100 text-xs font-medium mb-1 opacity-80">현재 자산</div>
                  <div className="text-2xl font-bold">
                    {new Intl.NumberFormat('ko-KR').format(totalAssets)}원
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-blue-100 text-xs font-medium opacity-80">목표 자산 (120%)</span>
                    <span className="text-xs font-bold">{((totalAssets / (totalAssets * 1.2 || 1)) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2 mb-1">
                    <div 
                      className="bg-emerald-400 h-2 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.6)] transition-all duration-1000" 
                      style={{ width: `${Math.min(100, (totalAssets / (totalAssets * 1.2 || 1)) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-right text-[10px] text-blue-100 opacity-60">
                    {new Intl.NumberFormat('ko-KR').format(totalAssets * 1.2)}원 목표
                  </div>
                </div>

                <div className="pt-2">
                  <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm border border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-blue-100 opacity-70 mb-1">Next Step</div>
                    <div className="text-xs font-medium leading-relaxed">
                      현재 자산 대비 약 {new Intl.NumberFormat('ko-KR').format(totalAssets * 0.2)}원을 더 모으면 목표에 도달합니다!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tables Row */}
          <div className="grid grid-cols-12 gap-6 mb-8">
            {/* 자산 표 */}
            <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h2 className="text-lg font-bold text-gray-900">자산 목록</h2>
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">Top 5</span>
              </div>
              <div className="p-1">
                <Table data={filteredAssets.slice(0, 5)} columns={assetTableColumns} />
              </div>
            </div>

            {/* 부채 표 */}
            <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h2 className="text-lg font-bold text-gray-900">부채 목록</h2>
                <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">전체</span>
              </div>
              <div className="p-1">
                <Table data={filteredLiabilities} columns={liabilityTableColumns} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    cash: '현금',
    stocks: '주식',
    bonds: '채권',
    real_estate: '부동산',
    other: '기타',
  };
  return labels[category] || category;
}

function getOwnerLabel(owner: string): string {
  const labels: Record<string, string> = {
    husband: '남편',
    wife: '아내',
    joint: '공동',
  };
  return labels[owner] || owner;
}
