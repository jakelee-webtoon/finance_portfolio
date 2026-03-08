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
    
    // Firebase에서 데이터 동기화 후 로컬 데이터 로드
    const loadData = async () => {
      try {
        // Firebase에서 데이터 가져와서 localStorage에 동기화
        await syncFromFirebase();
        
        // 동기화 후 localStorage에서 데이터 로드
        const dashboardState = getDashboardState();
        setState(dashboardState);
        setAssets(getAssets());
        setLiabilities(getLiabilities());
        
        // 환율 로드
        getExchangeRates().then((rates) => {
          setExchangeRates(rates);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };
    
    loadData();
  }, [isAuthenticated]);

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

  const totalAssets = useMemo(() => {
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
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">총 자산</div>
              <div className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('ko-KR').format(totalAssets)}원
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">순자산</div>
              <div className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {new Intl.NumberFormat('ko-KR').format(netWorth)}원
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">부채</div>
              <div className="text-2xl font-bold text-red-600">
                {new Intl.NumberFormat('ko-KR').format(totalLiabilities)}원
              </div>
            </div>
          </div>

          {/* Charts and Tables Row */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            {/* 자산 구성 차트 */}
            <div className="col-span-12 lg:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">자산 구성</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={assetByCategory}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={CustomLabel}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    minAngle={1}
                  >
                    {assetByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => new Intl.NumberFormat('ko-KR').format(value) + '원'}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 순자산/부채 차트 */}
            <div className="col-span-12 lg:col-span-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">순자산 vs 부채</h2>
              {netWorthData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={netWorthData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {netWorthData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.name === '순자산' ? '#00C49F' : '#FF8042'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => new Intl.NumberFormat('ko-KR').format(value) + '원'}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-gray-500">
                  데이터가 없습니다
                </div>
              )}
            </div>

            {/* 갈아타기 위젯 */}
            <div className="col-span-12 lg:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">갈아타기</h2>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">현재 자산</div>
                  <div className="text-xl font-bold text-blue-600">
                    {new Intl.NumberFormat('ko-KR').format(totalAssets)}원
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">목표 자산</div>
                  <div className="text-xl font-bold text-green-600">
                    {new Intl.NumberFormat('ko-KR').format(totalAssets * 1.2)}원
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">달성률</div>
                  <div className="text-xl font-bold text-gray-900">
                    {totalAssets > 0
                      ? ((totalAssets / (totalAssets * 1.2)) * 100).toFixed(1)
                      : 0}%
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Tables Row */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            {/* 자산 표 */}
            <div className="col-span-12 lg:col-span-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">자산 목록</h2>
              <Table data={filteredAssets} columns={assetTableColumns} searchable />
            </div>

            {/* 부채 표 */}
            <div className="col-span-12 lg:col-span-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">부채 목록</h2>
              <Table data={filteredLiabilities} columns={liabilityTableColumns} searchable />
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
