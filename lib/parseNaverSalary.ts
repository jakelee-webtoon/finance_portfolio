import { NaverSalaryStats, NaverOrg } from '@/types';

// 연봉 문자열을 숫자로 변환 (예: "1억 957만" -> 109570000)
function parseSalary(salaryStr: string): number {
  // 콤마 제거
  let cleaned = salaryStr.replace(/,/g, '').trim();
  
  let total = 0;
  
  // 억 단위 파싱
  const eokMatch = cleaned.match(/(\d+(?:\.\d+)?)억/);
  if (eokMatch) {
    total += parseFloat(eokMatch[1]) * 100000000;
    cleaned = cleaned.replace(eokMatch[0], '').trim();
  }
  
  // 만 단위 파싱
  const manMatch = cleaned.match(/(\d+(?:\.\d+)?)만/);
  if (manMatch) {
    total += parseFloat(manMatch[1]) * 10000;
  }
  
  return Math.round(total);
}

// 회사명을 NaverOrg 타입으로 변환
function parseCompany(companyName: string): NaverOrg {
  if (companyName.includes('네이버주식회사') || companyName === '네이버주식회사') {
    return 'NAVER_HQ';
  } else if (companyName.includes('웹툰')) {
    return 'WEBTOON';
  } else if (companyName.includes('클라우드')) {
    return 'CLOUD';
  } else if (companyName.includes('파이낸셜')) {
    return 'FINANCIAL';
  } else if (companyName.includes('랩스')) {
    return 'LABS';
  } else if (companyName.includes('제트')) {
    return 'JET';
  }
  return 'NAVER_HQ'; // 기본값
}

// 연차 파싱
function parseYears(yearsStr: string): number | null {
  const match = yearsStr.match(/\((\d+)년차\)/);
  return match ? parseInt(match[1]) : null;
}

// 텍스트 파일 파싱하여 연봉 데이터 추출 (연차 정보 포함)
export function parseNaverSalaryText(text: string): Array<{
  org: NaverOrg;
  salary: number;
  yearsOfExperience: number;
}> {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const results: Array<{ org: NaverOrg; salary: number; yearsOfExperience: number }> = [];
  
  for (let i = 0; i < lines.length; i += 5) {
    if (i + 1 < lines.length && i + 2 < lines.length) {
      const companyName = lines[i];
      const salaryStr = lines[i + 1];
      const yearsStr = lines[i + 2];
      
      if (companyName && salaryStr && yearsStr) {
        const org = parseCompany(companyName);
        const salary = parseSalary(salaryStr);
        const years = parseYears(yearsStr);
        
        if (salary > 0 && years !== null) {
          results.push({ org, salary, yearsOfExperience: years });
        }
      }
    }
  }
  
  return results;
}

// 조직별 통계 계산 (전체)
export function calculateStats(
  data: Array<{ org: NaverOrg; salary: number; yearsOfExperience: number }>,
  org: NaverOrg
): NaverSalaryStats | null {
  const orgData = data.filter(d => d.org === org).map(d => d.salary);
  
  if (orgData.length === 0) return null;
  
  // 정렬
  const sorted = [...orgData].sort((a, b) => a - b);
  
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = sorted[Math.floor(n / 2)];
  const p25 = sorted[Math.floor(n * 0.25)];
  const p75 = sorted[Math.floor(n * 0.75)];
  const avg = sorted.reduce((sum, val) => sum + val, 0) / n;
  
  // 현재 연도로 가정 (실제로는 데이터에서 추출하거나 파라미터로 받아야 함)
  const currentYear = new Date().getFullYear().toString();
  
  return {
    year: currentYear,
    org,
    scope: 'TC', // 텍스트 데이터는 TC로 가정
    min: Math.round(min),
    p25: Math.round(p25),
    median: Math.round(median),
    avg: Math.round(avg),
    p75: Math.round(p75),
    max: Math.round(max),
    n,
  };
}

// 연차별 통계 계산
export function calculateStatsByYears(
  data: Array<{ org: NaverOrg; salary: number; yearsOfExperience: number }>,
  org: NaverOrg,
  yearsOfExperience: number
): NaverSalaryStats | null {
  const orgData = data.filter(
    d => d.org === org && d.yearsOfExperience === yearsOfExperience
  ).map(d => d.salary);
  
  if (orgData.length === 0) return null;
  
  // 정렬
  const sorted = [...orgData].sort((a, b) => a - b);
  
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n >= 2 ? sorted[Math.floor(n / 2)] : sorted[0];
  const p25 = n >= 2 ? sorted[Math.floor(n * 0.25)] : sorted[0];
  const p75 = n >= 2 ? sorted[Math.floor(n * 0.75)] : sorted[0];
  const avg = sorted.reduce((sum, val) => sum + val, 0) / n;
  
  // 현재 연도로 가정
  const currentYear = new Date().getFullYear().toString();
  
  return {
    year: currentYear,
    org,
    scope: 'TC',
    yearsOfExperience,
    min: Math.round(min),
    p25: Math.round(p25),
    median: Math.round(median),
    avg: Math.round(avg),
    p75: Math.round(p75),
    max: Math.round(max),
    n,
  };
}
