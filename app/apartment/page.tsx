'use client';

import { useState, useEffect, useMemo } from 'react';
import TopBar from '@/components/TopBar';
import Navigation from '@/components/Navigation';
import Table, { Column } from '@/components/Table';
import { Apartment, DashboardState, Asset } from '@/types';
import { getDashboardState, getApartments, setApartments, getAssets, setAssets, syncFromFirebase } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';

export default function ApartmentPage() {
  const isAuthenticated = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [apartments, setApartmentsState] = useState<Apartment[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    apartmentName: '',
    address: '',
    dong: '',
    ho: '',
    area: '',
    floor: '',
    buildYear: '',
    purchasePrice: '',
    purchaseDate: '',
    currentPrice: '',
    currentPriceDate: '',
    owner: 'joint' as 'husband' | 'wife' | 'joint',
    currency: 'KRW',
  });

  useEffect(() => {
    if (isAuthenticated !== true) return;
    
    // Firebase에서 데이터 동기화 후 로컬 데이터 로드
    const loadData = async () => {
      await syncFromFirebase();
      
      const dashboardState = getDashboardState();
      setState(dashboardState);
      const loadedApartments = getApartments();
      setApartmentsState(loadedApartments);
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

  // 아파트 목록이 로드되면 기존 자산명을 "아파트"로 업데이트 (한 번만 실행)
  useEffect(() => {
    if (!state || apartments.length === 0) return;
    
    const assets = getAssets();
    let hasChanges = false;
    const updatedAssets = assets.map((asset) => {
      // real_estate 카테고리이고 아파트명 형식인 경우 "아파트"로 변경
      if (asset.category === 'real_estate' && asset.name.includes('(') && asset.name.includes('동')) {
        // 아파트명 형식인지 확인 (예: "e편한세상서울대입구 (208동 603호)")
        const match = asset.name.match(/^(.+?)\s*\((\d+)동\s*(\d+)호\)$/);
        if (match) {
          hasChanges = true;
          return {
            ...asset,
            name: '아파트',
          };
        }
      }
      return asset;
    });
    
    if (hasChanges) {
      setAssets(updatedAssets);
    }
    
    // 각 아파트를 자산으로 동기화
    apartments.forEach((apartment) => {
      syncApartmentToAsset(apartment);
    });
  }, [apartments.length, state?.scope]); // 의존성을 최소화하여 무한 루프 방지


  const filteredApartments = useMemo(() => {
    if (!state) return [];
    if (state.scope === 'combined') return apartments;
    return apartments.filter((apt) => apt.owner === state.scope || apt.owner === 'joint');
  }, [apartments, state]);

  // 아파트를 포트폴리오 자산으로 동기화
  const syncApartmentToAsset = (apartment: Apartment) => {
    const assets = getAssets();
    const assetName = '아파트';
    const currentValue = apartment.currentPrice || apartment.purchasePrice;
    
    // 기존 자산 찾기 (아파트 ID로 매칭 또는 아파트명 형식으로 매칭)
    const apartmentId = `asset-apt-${apartment.id}`;
    const oldAssetName = `${apartment.apartmentName} (${apartment.dong}동 ${apartment.ho}호)`;
    
    const existingAssetIndex = assets.findIndex(
      (asset) => asset.id === apartmentId || 
                 (asset.name === oldAssetName && asset.category === 'real_estate') ||
                 (asset.name === assetName && asset.category === 'real_estate' && asset.id.startsWith('asset-apt-'))
    );
    
    const today = new Date().toISOString().split('T')[0];
    const currentUser = (state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband') || apartment.last_modified_by || 'husband';
    
    if (existingAssetIndex >= 0) {
      // 기존 자산 업데이트 (이름도 "아파트"로 변경)
      const updatedAssets = assets.map((asset, index) =>
        index === existingAssetIndex
          ? {
              ...asset,
              id: apartmentId, // ID는 유지하여 매칭
              name: assetName, // 이름을 "아파트"로 변경
              amount: currentValue,
              owner: apartment.owner,
              currency: apartment.currency,
              as_of_date: today,
              last_modified_by: currentUser,
            }
          : asset
      );
      setAssets(updatedAssets);
    } else {
      // 새 자산 생성
      const newAsset: Asset = {
        id: apartmentId,
        name: assetName,
        amount: currentValue,
        owner: apartment.owner,
        category: 'real_estate',
        currency: apartment.currency,
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
      };
      setAssets([...assets, newAsset]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const currentUser = state?.scope === 'husband' ? 'husband' : state?.scope === 'wife' ? 'wife' : 'husband';
    const today = new Date().toISOString().split('T')[0];

    if (editingId) {
      // 수정
      const updatedApartment = {
        ...apartments.find(apt => apt.id === editingId)!,
        ...formData,
        area: Number(formData.area),
        floor: Number(formData.floor),
        purchasePrice: Number(formData.purchasePrice),
        currentPrice: formData.currentPrice ? Number(formData.currentPrice) : undefined,
        currentPriceDate: formData.currentPriceDate || undefined,
        as_of_date: today,
        last_modified_by: currentUser,
      };
      
      const updated = apartments.map((apt) =>
        apt.id === editingId ? updatedApartment : apt
      );
      setApartmentsState(updated);
      setApartments(updated);
      
      // 포트폴리오 자산도 동기화
      syncApartmentToAsset(updatedApartment);
      
      setEditingId(null);
    } else {
      // 추가
      const newApartment: Apartment = {
        id: `apt-${Date.now()}`,
        ...formData,
        area: Number(formData.area),
        floor: Number(formData.floor),
        purchasePrice: Number(formData.purchasePrice),
        currentPrice: formData.currentPrice ? Number(formData.currentPrice) : undefined,
        currentPriceDate: formData.currentPriceDate || undefined,
        source_type: 'manual',
        as_of_date: today,
        last_modified_by: currentUser,
      };
      const updated = [...apartments, newApartment];
      setApartmentsState(updated);
      setApartments(updated);
      
      // 포트폴리오 자산도 동기화
      syncApartmentToAsset(newApartment);
    }

    // 폼 초기화
    setFormData({
      apartmentName: '',
      address: '',
      dong: '',
      ho: '',
      area: '',
      floor: '',
      buildYear: '',
      purchasePrice: '',
      purchaseDate: '',
      currentPrice: '',
      currentPriceDate: '',
      owner: 'joint',
      currency: 'KRW',
    });
    setIsFormOpen(false);
  };

  const handleEdit = (apartment: Apartment) => {
    setFormData({
      apartmentName: apartment.apartmentName,
      address: apartment.address,
      dong: apartment.dong,
      ho: apartment.ho,
      area: String(apartment.area),
      floor: String(apartment.floor),
      buildYear: apartment.buildYear,
      purchasePrice: String(apartment.purchasePrice),
      purchaseDate: apartment.purchaseDate,
      currentPrice: apartment.currentPrice ? String(apartment.currentPrice) : '',
      currentPriceDate: apartment.currentPriceDate || '',
      owner: apartment.owner,
      currency: apartment.currency,
    });
    setEditingId(apartment.id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      const apartment = apartments.find((apt) => apt.id === id);
      const updated = apartments.filter((apt) => apt.id !== id);
      setApartmentsState(updated);
      setApartments(updated);
      
      // 포트폴리오 자산도 삭제
      if (apartment) {
        const assets = getAssets();
        const updatedAssets = assets.filter(
          (asset) => asset.id !== `asset-apt-${apartment.id}`
        );
        setAssets(updatedAssets);
      }
    }
  };


  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({
      apartmentName: '',
      address: '',
      dong: '',
      ho: '',
      area: '',
      floor: '',
      buildYear: '',
      purchasePrice: '',
      purchaseDate: '',
      currentPrice: '',
      currentPriceDate: '',
      owner: 'joint',
      currency: 'KRW',
    });
  };

  const totalValue = useMemo(() => {
    return filteredApartments.reduce((sum, apt) => {
      const value = apt.currentPrice || apt.purchasePrice;
      return sum + value;
    }, 0);
  }, [filteredApartments]);

  const totalPurchaseValue = useMemo(() => {
    return filteredApartments.reduce((sum, apt) => sum + apt.purchasePrice, 0);
  }, [filteredApartments]);

  const totalGainLoss = useMemo(() => {
    return filteredApartments.reduce((sum, apt) => {
      const currentValue = apt.currentPrice || apt.purchasePrice;
      return sum + (currentValue - apt.purchasePrice);
    }, 0);
  }, [filteredApartments]);

  const apartmentColumns: Column<Apartment>[] = [
    { key: 'apartmentName', label: '아파트명', sortable: true },
    { key: 'address', label: '주소', sortable: true },
    {
      key: 'dong',
      label: '동/호',
      sortable: false,
      render: (_, row) => `${row.dong}동 ${row.ho}호`,
    },
    {
      key: 'area',
      label: '면적',
      sortable: true,
      render: (value) => `${value}㎡`,
    },
    {
      key: 'floor',
      label: '층',
      sortable: true,
      render: (value) => `${value}층`,
    },
    {
      key: 'purchasePrice',
      label: '매수 가격',
      sortable: true,
      render: (value) => `${new Intl.NumberFormat('ko-KR').format(value)}원`,
    },
    {
      key: 'currentPrice',
      label: '현재 시세',
      sortable: true,
      render: (value, row) => {
        if (!value) return '-';
        return (
          <div>
            <div className="font-semibold">
              {new Intl.NumberFormat('ko-KR').format(value)}원
            </div>
            {row.currentPriceDate && (
              <div className="text-xs text-gray-500">{row.currentPriceDate}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'gainLoss',
      label: '손익',
      sortable: false,
      render: (_, row) => {
        if (!row.currentPrice) return '-';
        const gainLoss = row.currentPrice - row.purchasePrice;
        const percent = (gainLoss / row.purchasePrice) * 100;
        return (
          <div>
            <div className={`font-semibold ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {gainLoss >= 0 ? '+' : ''}
              {new Intl.NumberFormat('ko-KR').format(gainLoss)}원
            </div>
            <div className={`text-xs ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ({gainLoss >= 0 ? '+' : ''}{percent.toFixed(2)}%)
            </div>
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
            <h1 className="text-2xl font-bold text-gray-900">아파트</h1>
            <button
              onClick={() => setIsFormOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              + 아파트 추가
            </button>
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">총 평가 금액</div>
              <div className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('ko-KR').format(totalValue)}원
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">총 매수 금액</div>
              <div className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('ko-KR').format(totalPurchaseValue)}원
              </div>
            </div>
            <div className="col-span-12 md:col-span-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">총 손익</div>
              <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalGainLoss >= 0 ? '+' : ''}
                {new Intl.NumberFormat('ko-KR').format(totalGainLoss)}원
              </div>
            </div>
          </div>

          {/* 입력 폼 모달 */}
          {isFormOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {editingId ? '아파트 수정' : '아파트 추가'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        아파트명 *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.apartmentName}
                        onChange={(e) => setFormData({ ...formData, apartmentName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예: 래미안 강남파크"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        주소 (법정동) *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예: 강남구 역삼동"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        동 *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.dong}
                        onChange={(e) => setFormData({ ...formData, dong: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="101"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        호수 *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.ho}
                        onChange={(e) => setFormData({ ...formData, ho: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="1201"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        전용면적 (㎡) *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.1"
                        value={formData.area}
                        onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="84.5"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        층수 *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.floor}
                        onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="12"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        건축년도
                      </label>
                      <input
                        type="text"
                        value={formData.buildYear}
                        onChange={(e) => setFormData({ ...formData, buildYear: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="2015"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        매수 가격 (원) *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="600000000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        매수일 *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.purchaseDate}
                        onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        현재 시세 (원)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.currentPrice}
                        onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="700000000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        시세 기준일
                      </label>
                      <input
                        type="date"
                        value={formData.currentPriceDate}
                        onChange={(e) => setFormData({ ...formData, currentPriceDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

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

          {/* 아파트 목록 테이블 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">내 아파트 목록</h2>
            </div>
            <Table data={filteredApartments} columns={apartmentColumns} searchable />
          </div>
        </div>
      </div>
    </div>
  );
}

