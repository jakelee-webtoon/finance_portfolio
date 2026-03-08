'use client';

import { useState } from 'react';
import { migrateToFirebase } from '@/lib/migrateToFirebase';

export default function MigratePage() {
  const [isMigrating, setIsMigrating] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    migrated: string[];
    errors: string[];
  } | null>(null);

  const handleMigrate = async () => {
    setIsMigrating(true);
    setResult(null);

    try {
      const migrationResult = await migrateToFirebase();
      setResult(migrationResult);
    } catch (error) {
      setResult({
        success: false,
        migrated: [],
        errors: [`마이그레이션 중 오류 발생: ${error instanceof Error ? error.message : 'Unknown error'}`],
      });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Firebase 데이터 마이그레이션
          </h1>
          
          <p className="text-gray-600 mb-6">
            localStorage에 저장된 데이터를 Firebase로 마이그레이션합니다.
            기존 데이터는 유지되며, Firebase에도 복사됩니다.
          </p>

          <button
            onClick={handleMigrate}
            disabled={isMigrating}
            className={`w-full px-4 py-3 rounded-lg font-semibold transition-colors ${
              isMigrating
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isMigrating ? '마이그레이션 중...' : '마이그레이션 시작'}
          </button>

          {result && (
            <div className="mt-6 space-y-4">
              {result.success && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-green-800 mb-2">
                    ✅ 마이그레이션 완료
                  </h2>
                  <ul className="list-disc list-inside text-green-700 space-y-1">
                    {result.migrated.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-red-800 mb-2">
                    ⚠️ 오류 발생
                  </h2>
                  <ul className="list-disc list-inside text-red-700 space-y-1">
                    {result.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.migrated.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-blue-800 mb-2">
                    📦 마이그레이션된 데이터
                  </h2>
                  <ul className="list-disc list-inside text-blue-700 space-y-1">
                    {result.migrated.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">다음 단계:</h3>
            <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
              <li>Firebase Console → Firestore Database에서 데이터 확인</li>
              <li>앱에서 데이터 추가/수정 시 Firebase에 자동 동기화됨</li>
              <li>기존 localStorage 데이터는 그대로 유지됨</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
