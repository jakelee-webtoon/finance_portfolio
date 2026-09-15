import { NaverSalaryStats, NaverOrg, SalaryScope } from '@/types';
import { statsByOrgAndYears } from './naverStatsByYears';

// 실제 네이버 연봉 통계 데이터 (텍스트 파일에서 파싱하여 계산)
// 모든 연도에 대해 동일한 통계 데이터 사용 (연도별 구분이 없으므로)
// BASE는 TC의 80%로 추정 (실제 데이터가 없으므로)

function createStats(
  org: NaverOrg,
  scope: SalaryScope,
  year: string,
  min: number,
  p25: number,
  median: number,
  avg: number,
  p75: number,
  max: number,
  n: number
): NaverSalaryStats {
  return {
    year,
    org,
    scope,
    min,
    p25,
    median,
    avg,
    p75,
    max,
    n,
  };
}

// 실제 파싱된 통계 데이터 (2023, 2024, 2025년 모두 동일한 데이터 사용)
// 사용자가 선택한 연도에 맞춰 필터링됨
const baseStats = [
  // NAVER_HQ
  { org: 'NAVER_HQ' as NaverOrg, tc: { min: 53940000, p25: 100020000, median: 118150000, avg: 124376578, p75: 144860000, max: 229490000, n: 301 } },
  // WEBTOON
  { org: 'WEBTOON' as NaverOrg, tc: { min: 71640000, p25: 86140000, median: 96560000, avg: 100233729, p75: 111740000, max: 173240000, n: 59 } },
  // CLOUD
  { org: 'CLOUD' as NaverOrg, tc: { min: 19710000, p25: 103410000, median: 122530000, avg: 125889474, p75: 144500000, max: 206300000, n: 133 } },
  // FINANCIAL
  { org: 'FINANCIAL' as NaverOrg, tc: { min: 76430000, p25: 98840000, median: 103060000, avg: 110004444, p75: 118660000, max: 164210000, n: 9 } },
  // LABS
  { org: 'LABS' as NaverOrg, tc: { min: 123180000, p25: 125440000, median: 151350000, avg: 150667500, p75: 202700000, max: 202700000, n: 4 } },
  // JET
  { org: 'JET' as NaverOrg, tc: { min: 72370000, p25: 99630000, median: 105200000, avg: 102887500, p75: 134350000, max: 134350000, n: 4 } },
];

// 2023, 2024, 2025년 모두에 대해 데이터 생성
const years = ['2023', '2024', '2025'];
export const mockNaverSalaryStats: NaverSalaryStats[] = years.flatMap(year =>
  baseStats.flatMap(({ org, tc }) => [
    createStats(org, 'TC', year, tc.min, tc.p25, tc.median, tc.avg, tc.p75, tc.max, tc.n),
    createStats(org, 'BASE', year, Math.round(tc.min * 0.8), Math.round(tc.p25 * 0.8), Math.round(tc.median * 0.8), Math.round(tc.avg * 0.8), Math.round(tc.p75 * 0.8), Math.round(tc.max * 0.8), tc.n),
  ])
);

// 조직명 표시용
export const orgLabels: Record<NaverOrg, string> = {
  NAVER_HQ: '네이버 본사',
  WEBTOON: '네이버 웹툰',
  CLOUD: '네이버 클라우드',
  FINANCIAL: '네이버 파이낸셜',
  LABS: '네이버 랩스',
  JET: '네이버 제트',
};

// 통계 데이터 필터링 (전체 통계)
export function getFilteredStats(
  year: string,
  scope: SalaryScope
): NaverSalaryStats[] {
  return mockNaverSalaryStats.filter(
    (stat) => stat.year === year && stat.scope === scope
  );
}

// 연차별 통계 데이터 필터링
export function getFilteredStatsByYears(
  year: string,
  scope: SalaryScope,
  yearsOfExperience: number
): NaverSalaryStats[] {
  const orgs: NaverOrg[] = ['NAVER_HQ', 'WEBTOON', 'CLOUD', 'FINANCIAL', 'LABS', 'JET'];
  const results: NaverSalaryStats[] = [];
  
  for (const org of orgs) {
    const orgStats = statsByOrgAndYears[org];
    if (orgStats && orgStats[yearsOfExperience]) {
      const yearStats = orgStats[yearsOfExperience][scope];
      if (yearStats) {
        results.push({
          year,
          org,
          scope,
          yearsOfExperience,
          ...yearStats,
        });
      }
    }
  }
  
  return results;
}

// 내 연봉과 통계 비교 계산
export interface SalaryComparison {
  org: NaverOrg;
  stats: NaverSalaryStats;
  medianGapAmount: number; // 내 연봉 - median
  medianGapPct: number; // (내 연봉 / median - 1) * 100
  p75Remaining: number; // max(0, p75 - 내 연봉)
  bandInOut: 'IN' | 'OUT'; // 내 연봉이 [p25, p75] 범위 안에 있으면 IN
  percentile?: string; // 예: "P60"
}

export function calculateComparison(
  mySalary: number,
  stats: NaverSalaryStats
): SalaryComparison {
  const medianGapAmount = mySalary - stats.median;
  const medianGapPct = stats.median > 0 ? ((mySalary / stats.median - 1) * 100) : 0;
  const p75Remaining = Math.max(0, stats.p75 - mySalary);
  const bandInOut = mySalary >= stats.p25 && mySalary <= stats.p75 ? 'IN' : 'OUT';

  const topPercent = calculateTopPercentile(mySalary, stats);
  
  // 소수점 첫째 자리까지 반올림
  const roundedTopPercent = Math.round(topPercent * 10) / 10;
  const percentile = `상위 ${roundedTopPercent}%`;

  return {
    org: stats.org,
    stats,
    medianGapAmount,
    medianGapPct,
    p75Remaining,
    bandInOut,
    percentile,
  };
}

function interpolateTopPercent(
  value: number,
  lowerValue: number,
  upperValue: number,
  lowerTopPercent: number,
  upperTopPercent: number
): number {
  if (upperValue === lowerValue) return upperTopPercent;
  const ratio = (value - lowerValue) / (upperValue - lowerValue);
  return lowerTopPercent + ratio * (upperTopPercent - lowerTopPercent);
}

export function calculateTopPercentile(
  mySalary: number,
  stats: Pick<NaverSalaryStats, 'min' | 'p25' | 'median' | 'p75' | 'max'>
): number {
  if (mySalary <= stats.min) return 100;
  if (mySalary <= stats.p25) {
    return interpolateTopPercent(mySalary, stats.min, stats.p25, 100, 75);
  }
  if (mySalary <= stats.median) {
    return interpolateTopPercent(mySalary, stats.p25, stats.median, 75, 50);
  }
  if (mySalary <= stats.p75) {
    return interpolateTopPercent(mySalary, stats.median, stats.p75, 50, 25);
  }
  if (mySalary <= stats.max) {
    return interpolateTopPercent(mySalary, stats.p75, stats.max, 25, 0);
  }
  return 0;
}
