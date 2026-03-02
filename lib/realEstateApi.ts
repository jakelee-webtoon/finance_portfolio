// 부동산 실거래가 API 관련 유틸리티

interface ApartmentTransaction {
  거래금액: string; // "150,000" (만원 단위)
  건축년도: string;
  년: string;
  월: string;
  일: string;
  법정동: string;
  아파트: string;
  전용면적: string;
  지번: string;
  층: string;
}

interface ApartmentPriceInfo {
  apartmentName: string;
  address: string;
  transactionPrice: number; // 원 단위
  transactionDate: string; // YYYY-MM-DD
  area: number; // 전용면적 (㎡)
  floor: string;
  buildYear: string;
}

// 공공데이터포털 국토교통부 아파트 실거래가 API
// API 키는 환경변수에서 가져옴
const REAL_ESTATE_API_KEY = process.env.NEXT_PUBLIC_REAL_ESTATE_API_KEY || '';
const REAL_ESTATE_API_URL = 'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev';

export async function getApartmentPrice(
  lawdCd: string, // 지역코드 (예: "11680" = 강남구)
  dealYmd: string // 거래년월 (예: "202401")
): Promise<ApartmentPriceInfo[]> {
  try {
    // API 키가 없으면 에러
    if (!REAL_ESTATE_API_KEY) {
      return [];
    }

    const url = `${REAL_ESTATE_API_URL}?serviceKey=${encodeURIComponent(REAL_ESTATE_API_KEY)}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return [];
    }

    const xmlText = await response.text();
    
    // XML 파싱 (간단한 파싱, 실제로는 xml2js 같은 라이브러리 사용 권장)
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const items = xmlDoc.getElementsByTagName('item');
    
    const results: ApartmentPriceInfo[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const 거래금액 = item.getElementsByTagName('거래금액')[0]?.textContent || '0';
      const 아파트 = item.getElementsByTagName('아파트')[0]?.textContent || '';
      const 법정동 = item.getElementsByTagName('법정동')[0]?.textContent || '';
      const 년 = item.getElementsByTagName('년')[0]?.textContent || '';
      const 월 = item.getElementsByTagName('월')[0]?.textContent || '';
      const 일 = item.getElementsByTagName('일')[0]?.textContent || '';
      const 전용면적 = item.getElementsByTagName('전용면적')[0]?.textContent || '0';
      const 층 = item.getElementsByTagName('층')[0]?.textContent || '';
      const 건축년도 = item.getElementsByTagName('건축년도')[0]?.textContent || '';
      
      // 거래금액은 만원 단위이므로 원으로 변환
      const price = parseInt(거래금액.replace(/,/g, '')) * 10000;
      
      results.push({
        apartmentName: 아파트,
        address: 법정동,
        transactionPrice: price,
        transactionDate: `${년}-${월.padStart(2, '0')}-${일.padStart(2, '0')}`,
        area: parseFloat(전용면적),
        floor: 층,
        buildYear: 건축년도,
      });
    }
    
    return results;
  } catch (error) {
    return [];
  }
}

// 아파트명으로 검색
export async function searchApartmentByName(
  apartmentName: string,
  lawdCd?: string
): Promise<ApartmentPriceInfo[]> {
  // 최근 3개월 데이터 조회
  const results: ApartmentPriceInfo[] = [];
  const today = new Date();
  
  for (let i = 0; i < 3; i++) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // 지역코드가 없으면 주요 지역 검색 (서울 강남구, 서초구 등)
    const lawdCodes = lawdCd ? [lawdCd] : ['11680', '11650', '11200', '11110'];
    
    for (const code of lawdCodes) {
      const data = await getApartmentPrice(code, yearMonth);
      const filtered = data.filter((item) => 
        item.apartmentName.includes(apartmentName)
      );
      results.push(...filtered);
    }
  }
  
  // 최신순으로 정렬
  return results.sort((a, b) => 
    new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
  );
}

// 지역코드 매핑 (주요 서울 지역)
export const LAW_D_CODES: Record<string, string> = {
  '강남구': '11680',
  '서초구': '11650',
  '송파구': '11710',
  '강동구': '11740',
  '영등포구': '11560',
  '마포구': '11440',
  '용산구': '11170',
  '종로구': '11110',
  '중구': '11140',
  '성동구': '11200',
  '광진구': '11215',
  '강북구': '11305',
  '도봉구': '11320',
  '노원구': '11350',
  '은평구': '11380',
  '서대문구': '11410',
  '강서구': '11500',
  '구로구': '11530',
  '금천구': '11545',
  '관악구': '11620', // 서울대입구 포함
  '동작구': '11590',
  '양천구': '11470',
};
