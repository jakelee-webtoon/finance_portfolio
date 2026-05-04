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

  /* 고정 높이로 레이아웃 점프·느린 느낌 완화 */
  if (loading) {
    return (
      <div className="text-xs text-gray-400 whitespace-nowrap h-5 flex items-center tabular-nums">
        환율…
      </div>
    );
  }

  if (!rates) {
    return <div className="text-xs text-gray-400 h-5 flex items-center">—</div>;
  }

  return (
    <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
      <span className="whitespace-nowrap">USD/KRW {rates.USD_TO_KRW?.toFixed(2)}</span>
      <span className="text-gray-300 hidden sm:inline">|</span>
      <span className="whitespace-nowrap sm:inline">KRW/USD {rates.KRW_TO_USD?.toFixed(4)}</span>
    </div>
  );
}
