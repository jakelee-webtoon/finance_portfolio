'use client';

import { useState, useEffect } from 'react';
import { getExchangeRates } from '@/lib/exchangeRate';

export default function ExchangeRateDisplay() {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRates() {
      try {
        const exchangeRates = await getExchangeRates();
        setRates(exchangeRates);
      } catch (error) {
        // 에러 발생 시 무시
      } finally {
        setLoading(false);
      }
    }
    fetchRates();
  }, []);

  if (loading) {
    return (
      <div className="text-xs text-gray-500">
        환율 로딩 중...
      </div>
    );
  }

  if (!rates) {
    return null;
  }

  return (
    <div className="text-xs text-gray-500 space-x-2">
      <span>USD/KRW: {rates.USD_TO_KRW?.toFixed(2)}</span>
      <span>|</span>
      <span>KRW/USD: {rates.KRW_TO_USD?.toFixed(6)}</span>
    </div>
  );
}
