'use client';

import { useState, useEffect, useMemo } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { Asset, Liability, DashboardState, Apartment } from '@/types';
import { getDashboardState, getAssets, setAssets, getLiabilities, setLiabilities, getApartments, setApartments, syncFromFirebase } from '@/lib/store';
import { getExchangeRates, convertCurrency } from '@/lib/exchangeRate';
import { useAuth } from '@/hooks/useAuth';

type TabType = 'assets' | 'liabilities';

export default function PortfolioPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [assets, setAssetsState] = useState<Asset[]>([]);
  const [liabilities, setLiabilitiesState] = useState<Liability[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('assets');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    category: 'cash' as 'cash' | 'stocks' | 'bonds' | 'real_estate' | 'other' | 'loan' | 'credit_card' | 'mortgage',
    currency: 'KRW',
  });

  useEffect(() => {
    if (isAuthenticated !== true) return;
    
    // Firebase에서 데이터 동기화 후 로컬 데이터 로드
    const loadData = async () => {
      await syncFromFirebase();
      
      const dashboardState = getDashboardState();
      setState(dashboardState);
      let assets = getAssets();
      
      // 기존 아파트 자산명을 "아파트"로 업데이트
      const apartments = getApartments();
    let hasChanges = false;
    assets = assets.map((asset) => {
      if (asset.category === 'real_estate') {
        // 아파트명 형식인 경우 (예: "e편한세상서울대입구 (208동 603호)")
        if (asset.name.includes('(') && asset.name.includes('동')) {
          const match = asset.name.match(/^(.+?)\s*\((\d+)동\s*(\d+)호\)$/);
          if (match) {
            const [, apartmentName, dong, ho] = match;
            // 해당 아파트가 존재하는지 확인
            const apartment = apartments.find(
              (apt) => apt.apartmentName === apartmentName.trim() && 
                       apt.dong === dong && 
                       apt.ho === ho
            );
            if (apartment) {
              hasChanges = true;
              return {
                ...asset,
                id: `asset-apt-${apartment.id}`, // ID도 업데이트
                name: '아파트',
                amount: asset.amount, // 기존 금액 유지
              };
            }
          }
        }
      }
      return asset;
    });
    
    if (hasChanges) {
      setAssets(assets);
    }
    
    setAssetsState(assets);
    setLiabilitiesState(getLiabilities());
    
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

  // 포트폴리오 자산을 아파트로 동기화
  const syncAssetToApartment = (asset: Asset) => {
    // real_estate 카테고리이고 아파트 자산인 경우만 동기화
    if (asset.category !== 'real_estate' || asset.name !== '아파트') return;
    
    const apartments = getApartments();
    
    // 자산 ID에서 아파트 ID 추출 (형식: "asset-apt-{apartmentId}")
    if (!asset.id.startsWith('asset-apt-')) return;
    
    const apartmentId = asset.id.replace('asset-apt-', '');
    
    // 해당 아파트 찾기
    const apartmentIndex = apartments.findIndex(
      (apt) => apt.id === apartmentId
    );
    
    if (apartmentIndex >= 0) {
      const today = new Date().toISOString().split('T')[0];
      const currentUser: 'husband' | 'wife' = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
      
      // 아파트의 currentPrice 업데이트
      const updatedApartments = apartments.map((apt, index) =>
        index === apartmentIndex
          ? {
              ...apt,
              currentPrice: asset.amount,
              currentPriceDate: today,
              owner: asset.owner,
              currency: asset.currency,
              as_of_date: today,
              last_modified_by: currentUser,
            }
          : apt
      );
      setApartments(updatedApartments);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const currentUser: 'husband' | 'wife' = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];

    if (activeTab === 'assets') {
      if (editingId) {
        // 수정 - 전체 자산 목록에서 찾기
        const allAssets = getAssets();
        const existingAsset = allAssets.find(asset => asset.id === editingId);
        if (!existingAsset) {
          console.error('Asset not found:', editingId);
          return;
        }
        
        const updatedAsset = {
          ...existingAsset,
          name: formData.name,
          amount: Number(formData.amount),
          owner: formData.owner,
          category: formData.category as Asset['category'],
          currency: formData.currency,
          as_of_date: today,
          last_modified_by: currentUser,
        };
        
        // 전체 자산 목록에서 수정
        const updated = allAssets.map((asset) =>
          asset.id === editingId ? updatedAsset : asset
        );
        setAssetsState(updated);
        setAssets(updated);
        
        // 아파트도 동기화 (real_estate 카테고리이고 아파트명 형식인 경우)
        if (updatedAsset.category === 'real_estate') {
          syncAssetToApartment(updatedAsset);
        }
        
        setEditingId(null);
      } else {
        // 추가
        const newAsset: Asset = {
          id: `asset-${Date.now()}`,
          name: formData.name,
          amount: Number(formData.amount),
          owner: formData.owner,
          category: formData.category as Asset['category'],
          currency: formData.currency,
          source_type: 'manual',
          as_of_date: today,
          last_modified_by: currentUser,
        };
        // 전체 자산 목록에 추가
        const allAssets = getAssets();
        const updated = [...allAssets, newAsset];
        setAssetsState(updated);
        setAssets(updated);
        
        // 아파트도 동기화 (real_estate 카테고리인 경우)
        if (newAsset.category === 'real_estate') {
          syncAssetToApartment(newAsset);
        }
      }
    } else {
      if (editingId) {
        // 수정
        // 전체 부채 목록에서 수정
        const allLiabilities = getLiabilities();
        const updated = allLiabilities.map((liability) =>
          liability.id === editingId
            ? {
                ...liability,
                name: formData.name,
                amount: Number(formData.amount),
                owner: formData.owner,
                category: formData.category as Liability['category'],
                currency: formData.currency,
                as_of_date: today,
                last_modified_by: currentUser,
              }
            : liability
        );
        setLiabilitiesState(updated);
        setLiabilities(updated);
        setEditingId(null);
      } else {
        // 추가
        const newLiability: Liability = {
          id: `liability-${Date.now()}`,
          name: formData.name,
          amount: Number(formData.amount),
          owner: formData.owner,
          category: formData.category as Liability['category'],
          currency: formData.currency,
          source_type: 'manual',
          as_of_date: today,
          last_modified_by: currentUser,
        };
        // 전체 부채 목록에 추가
        const allLiabilities = getLiabilities();
        const updated = [...allLiabilities, newLiability];
        setLiabilitiesState(updated);
        setLiabilities(updated);
      }
    }

    // 폼 초기화
    setFormData({
      name: '',
      amount: '',
      owner: 'joint',
      category: activeTab === 'assets' ? 'cash' : 'loan',
      currency: 'KRW',
    });
    setIsFormOpen(false);
  };

  const handleEditAsset = (asset: Asset) => {
    setFormData({
      name: asset.name,
      amount: String(asset.amount),
      owner: asset.owner,
      category: asset.category,
      currency: asset.currency,
    });
    setEditingId(asset.id);
    setActiveTab('assets');
    setIsFormOpen(true);
  };

  const handleEditLiability = (liability: Liability) => {
    setFormData({
      name: liability.name,
      amount: String(liability.amount),
      owner: liability.owner,
      category: liability.category,
      currency: liability.currency,
    });
    setEditingId(liability.id);
    setActiveTab('liabilities');
    setIsFormOpen(true);
  };

  const handleDeleteAsset = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      // 전체 자산 목록에서 삭제
      const allAssets = getAssets();
      const updated = allAssets.filter((asset) => asset.id !== id);
      setAssetsState(updated);
      setAssets(updated);
    }
  };

  const handleDeleteLiability = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      // 전체 부채 목록에서 삭제
      const allLiabilities = getLiabilities();
      const updated = allLiabilities.filter((liability) => liability.id !== id);
      setLiabilitiesState(updated);
      setLiabilities(updated);
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({
      name: '',
      amount: '',
      owner: 'joint',
      category: activeTab === 'assets' ? 'cash' : 'loan',
      currency: 'KRW',
    });
  };

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

  const assetsByCategory = useMemo(() => {
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
    return Object.entries(categoryMap).map(([category, amount]) => ({
      category,
      amount: Math.floor(amount),
      label: getAssetCategoryLabel(category),
    }));
  }, [filteredAssets, exchangeRates]);

  const liabilitiesByCategory = useMemo(() => {
    if (!exchangeRates) return [];
    const categoryMap: Record<string, number> = {};
    filteredLiabilities.forEach((liability) => {
      const category = liability.category;
      let krwAmount = liability.amount;
      if (liability.currency === 'USD') {
        krwAmount = liability.amount * exchangeRates.USD_TO_KRW;
      } else if (liability.currency === 'EUR') {
        krwAmount = liability.amount * exchangeRates.EUR_TO_KRW;
      }
      categoryMap[category] = (categoryMap[category] || 0) + krwAmount;
    });
    return Object.entries(categoryMap).map(([category, amount]) => ({
      category,
      amount: Math.floor(amount),
      label: getLiabilityCategoryLabel(category),
    }));
  }, [filteredLiabilities, exchangeRates]);

  const assetColumns: Column<Asset>[] = [
    { key: 'name', label: '자산명', sortable: true },
    {
      key: 'category',
      label: '카테고리',
      sortable: true,
      render: (value) => getAssetCategoryLabel(value),
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
            onClick={() => handleEditAsset(row)}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            수정
          </button>
          <button
            onClick={() => handleDeleteAsset(row.id)}
            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            삭제
          </button>
        </div>
      ),
    },
  ];

  const liabilityColumns: Column<Liability>[] = [
    { key: 'name', label: '부채명', sortable: true },
    {
      key: 'category',
      label: '카테고리',
      sortable: true,
      render: (value) => getLiabilityCategoryLabel(value),
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
            onClick={() => handleEditLiability(row)}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            수정
          </button>
          <button
            onClick={() => handleDeleteLiability(row.id)}
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
            <h1 className="text-2xl font-bold text-gray-900">포트폴리오</h1>
            <button
              onClick={() => {
                setIsFormOpen(true);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              + {activeTab === 'assets' ? '자산' : '부채'} 추가
            </button>
          </div>

          {/* 탭 */}
          <div className="mb-6">
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => {
                  setActiveTab('assets');
                  setIsFormOpen(false);
                  setEditingId(null);
                }}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded transition-colors ${
                  activeTab === 'assets'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                자산
              </button>
              <button
                onClick={() => {
                  setActiveTab('liabilities');
                  setIsFormOpen(false);
                  setEditingId(null);
                }}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded transition-colors ${
                  activeTab === 'liabilities'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                부채
              </button>
            </div>
          </div>

          {/* 통계 카드 */}
          {activeTab === 'assets' ? (
            <div className="grid grid-cols-12 gap-4 mb-6">
              <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-sm text-gray-600 mb-1">총 자산</div>
                <div className="text-2xl font-bold text-gray-900">
                  {new Intl.NumberFormat('ko-KR').format(totalAssets)}원
                </div>
              </div>
              <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-sm text-gray-600 mb-1">자산 항목 수</div>
                <div className="text-2xl font-bold text-gray-900">{filteredAssets.length}개</div>
              </div>
              <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-sm text-gray-600 mb-1">평균 자산</div>
                <div className="text-2xl font-bold text-gray-900">
                  {filteredAssets.length > 0
                    ? `${new Intl.NumberFormat('ko-KR').format(Math.floor(totalAssets / filteredAssets.length))}원`
                    : '0원'}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-4 mb-6">
              <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-sm text-gray-600 mb-1">총 부채</div>
                <div className="text-2xl font-bold text-red-600">
                  {new Intl.NumberFormat('ko-KR').format(totalLiabilities)}원
                </div>
              </div>
              <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-sm text-gray-600 mb-1">부채 항목 수</div>
                <div className="text-2xl font-bold text-gray-900">{filteredLiabilities.length}개</div>
              </div>
              <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-sm text-gray-600 mb-1">순자산</div>
                <div className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {new Intl.NumberFormat('ko-KR').format(netWorth)}원
                </div>
              </div>
            </div>
          )}

          {/* 카테고리별 통계 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 lg:col-span-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {activeTab === 'assets' ? '카테고리별 자산' : '카테고리별 부채'}
              </h2>
              <div className="space-y-2">
                {(activeTab === 'assets' ? assetsByCategory : liabilitiesByCategory).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">{item.label}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-600">
                        {activeTab === 'assets'
                          ? totalAssets > 0
                            ? `${((item.amount / totalAssets) * 100).toFixed(1)}%`
                            : '0%'
                          : totalLiabilities > 0
                          ? `${((item.amount / totalLiabilities) * 100).toFixed(1)}%`
                          : '0%'}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {new Intl.NumberFormat('ko-KR').format(item.amount)}원
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 입력 폼 모달 */}
          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {editingId ? `${activeTab === 'assets' ? '자산' : '부채'} 수정` : `${activeTab === 'assets' ? '자산' : '부채'} 추가`}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {activeTab === 'assets' ? '자산명' : '부채명'} *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={activeTab === 'assets' ? '예: 현금성 자산, 삼성전자 주식 등' : '예: 주택담보대출, 신용카드 등'}
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
                        {activeTab === 'assets' ? (
                          <>
                            <option value="cash">현금</option>
                            <option value="stocks">주식</option>
                            <option value="bonds">채권</option>
                            <option value="real_estate">부동산</option>
                            <option value="other">기타</option>
                          </>
                        ) : (
                          <>
                            <option value="loan">대출</option>
                            <option value="credit_card">신용카드</option>
                            <option value="mortgage">주택담보대출</option>
                            <option value="other">기타</option>
                          </>
                        )}
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

          {/* 목록 테이블 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {activeTab === 'assets' ? '자산 목록' : '부채 목록'}
              </h2>
            </div>
            {activeTab === 'assets' ? (
              <Table
                data={filteredAssets}
                columns={assetColumns}
                searchable
              />
            ) : (
              <Table
                data={filteredLiabilities}
                columns={liabilityColumns}
                searchable
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getAssetCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    cash: '현금',
    stocks: '주식',
    bonds: '채권',
    real_estate: '부동산',
    other: '기타',
  };
  return labels[category] || category;
}

function getLiabilityCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    loan: '대출',
    credit_card: '신용카드',
    mortgage: '주택담보대출',
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
