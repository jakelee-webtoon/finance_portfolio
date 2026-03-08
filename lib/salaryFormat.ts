// 연봉 포맷팅 유틸리티

export function formatCurrency(amount: number, unit: '만원' | '원'): string {
  if (unit === '만원') {
    const man = Math.round(amount / 10000);
    return `${new Intl.NumberFormat('ko-KR').format(man)}만원`;
  } else {
    return `${new Intl.NumberFormat('ko-KR').format(Math.round(amount))}원`;
  }
}

export function formatPercentage(value: number, decimals: number = 1): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, unit: '만원' | '원'): string {
  if (unit === '만원') {
    const man = Math.round(value / 10000);
    return new Intl.NumberFormat('ko-KR').format(man);
  } else {
    return new Intl.NumberFormat('ko-KR').format(Math.round(value));
  }
}
