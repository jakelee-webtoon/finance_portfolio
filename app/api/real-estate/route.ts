import { NextRequest, NextResponse } from 'next/server';

// 공공데이터포털 국토교통부 아파트 실거래가 API
// 서버 사이드에서 호출하여 CORS 문제 해결

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const apartmentName = searchParams.get('apartmentName');
  const lawdCd = searchParams.get('lawdCd');
  const dealYmd = searchParams.get('dealYmd');
  const dong = searchParams.get('dong');
  const ho = searchParams.get('ho');
  const area = searchParams.get('area');

  const apiKey = process.env.REAL_ESTATE_API_KEY || '';
  
  // API 키가 없어도 동작하도록 (mock 데이터 반환)
  if (!apiKey) {
    // Mock 데이터 반환
    if (apartmentName) {
      return NextResponse.json({
        results: [
          {
            apartmentName: apartmentName,
            address: '강남구',
            transactionPrice: 800000000,
            transactionDate: new Date().toISOString().split('T')[0],
            area: area ? parseFloat(area) : 84.5,
            floor: '12',
            buildYear: '2015',
            dong: dong || '',
            ho: ho || '',
          },
        ],
      });
    }
    return NextResponse.json({ results: [] });
  }

  try {
    // 아파트명 목록 검색 (검색어만으로 아파트명 리스트 반환)
    if (apartmentName && searchParams.get('listOnly') === 'true') {
      const results = await searchApartmentNames(apartmentName, lawdCd || undefined);
      
      // 결과를 문자열 배열로 변환 (호환성 유지)
      const names = results.map((item: any) => typeof item === 'string' ? item : item.name);
      
      return NextResponse.json({ results: names, detailedResults: results });
    }
    
    // 아파트명으로 검색 (더 정확한 매칭을 위해 추가 정보 전달)
    if (apartmentName) {
      const results = await searchApartmentByName(
        apartmentName, 
        lawdCd || undefined,
        dong || undefined,
        ho || undefined,
        area ? parseFloat(area) : undefined
      );
      return NextResponse.json({ results });
    }
    
    // 지역코드와 거래년월로 검색
    if (lawdCd && dealYmd) {
      const results = await getApartmentPrice(lawdCd, dealYmd);
      return NextResponse.json({ results });
    }
    
    return NextResponse.json(
      { error: 'apartmentName or (lawdCd and dealYmd) is required' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getApartmentPrice(lawdCd: string, dealYmd: string) {
  const apiKey = process.env.REAL_ESTATE_API_KEY || '';
  
  if (!apiKey) {
    return [];
  }
  
  // 공공데이터포털 아파트 실거래가 API
  // 요청 URL: https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade
  // 필수 파라미터: serviceKey, LAWD_CD, DEAL_YMD
  const baseUrl = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
  const params = new URLSearchParams({
    serviceKey: apiKey,
    LAWD_CD: lawdCd,
    DEAL_YMD: dealYmd,
  });
  
  const url = `${baseUrl}?${params.toString()}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/xml, text/xml',
        'Content-Type': 'application/xml',
      },
      // 공공데이터 API는 GET 요청
      method: 'GET',
    });
    
    if (!response.ok) {
      const text = await response.text();
      
      // 에러 응답 파싱
      if (text.includes('<resultCode>')) {
        const resultCode = extractTag(text, 'resultCode');
        const resultMsg = extractTag(text, 'resultMsg');
      }
      
      throw new Error(`Failed to fetch real estate data: ${response.status}`);
    }
    
    const xmlText = await response.text();
    
    // 응답 에러 체크
    if (xmlText.includes('<resultCode>')) {
      const resultCode = extractTag(xmlText, 'resultCode');
      const resultMsg = extractTag(xmlText, 'resultMsg');
      
      if (resultCode && resultCode !== '00' && resultCode !== '000') {
        // 에러 코드가 있어도 item이 있을 수 있으므로 계속 진행
      }
    }
    
    // item 개수 확인
    const itemCount = (xmlText.match(/<item>/g) || []).length;
    
    // XML 파싱
    const results = parseXML(xmlText);
    
    return results;
  } catch (error) {
    throw error;
  }
}

async function searchApartmentNames(searchQuery: string, lawdCd?: string) {
  const apartmentMap = new Map<string, { 
    name: string; 
    count: number; 
    latestTransaction?: any;
    address?: string;
  }>();
  const today = new Date();
  const normalizedQuery = searchQuery.trim().toLowerCase();
  
  if (normalizedQuery.length < 2) {
    return [];
  }
  
  // 최근 3개월 데이터 조회 (성능 개선)
  const monthsToSearch = 3;
  for (let i = 0; i < monthsToSearch; i++) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // 지역코드가 있으면 해당 지역만, 없으면 주요 서울 지역 검색
    const lawdCodes = lawdCd ? [lawdCd] : ['11620', '11680', '11650', '11200', '11110', '11710', '11740'];
    
    for (const code of lawdCodes) {
      try {
        const data = await getApartmentPrice(code, yearMonth);
        
        // 검색어가 포함된 아파트명 수집 (대소문자 무시, 부분 일치)
        let matchCount = 0;
        data.forEach((item: any) => {
          if (item.apartmentName && typeof item.apartmentName === 'string') {
            const normalizedName = item.apartmentName.toLowerCase();
            let shouldInclude = false;
            
            // 정확히 포함되는 경우
            if (normalizedName.includes(normalizedQuery)) {
              shouldInclude = true;
            }
            // 초성 검색 지원 (한글 초성)
            else if (normalizedQuery.length >= 2 && isKoreanInitial(normalizedQuery)) {
              const initials = getKoreanInitials(item.apartmentName);
              if (initials.includes(normalizedQuery)) {
                shouldInclude = true;
              }
            }
            
            if (shouldInclude) {
              matchCount++;
              const existing = apartmentMap.get(item.apartmentName);
              if (existing) {
                existing.count++;
                // 최신 거래 정보 업데이트
                if (!existing.latestTransaction || 
                    new Date(item.transactionDate) > new Date(existing.latestTransaction.transactionDate)) {
                  existing.latestTransaction = item;
                }
              } else {
                apartmentMap.set(item.apartmentName, { 
                  name: item.apartmentName, 
                  count: 1,
                  latestTransaction: item,
                  address: item.address,
                });
              }
            }
          }
        });
      } catch (error) {
        // 에러는 무시하고 계속
      }
    }
  }
  
  // 정확도 순으로 정렬
  // 1. 검색어로 시작하는 것 우선
  // 2. 빈도가 높은 것 우선
  // 3. 알파벳 순
  const results = Array.from(apartmentMap.values()).sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(normalizedQuery);
    const bStarts = b.name.toLowerCase().startsWith(normalizedQuery);
    
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    if (a.count !== b.count) return b.count - a.count;
    
    return a.name.localeCompare(b.name, 'ko');
  });
  
  // 최대 50개만 반환 (아파트명과 추가 정보 포함)
  return results.slice(0, 50).map(item => ({
    name: item.name,
    address: item.address,
    latestTransaction: item.latestTransaction,
  }));
}

// 한글 초성 추출
function getKoreanInitials(text: string): string {
  const initials: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    
    // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const initial = Math.floor((code - 0xAC00) / 588);
      const initialChars = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
      initials.push(initialChars[initial]);
    } else {
      initials.push(char);
    }
  }
  return initials.join('');
}

// 초성인지 확인
function isKoreanInitial(text: string): boolean {
  const initialChars = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  return text.split('').every(char => initialChars.includes(char));
}

async function searchApartmentByName(
  apartmentName: string, 
  lawdCd?: string,
  dong?: string,
  ho?: string,
  area?: number
) {
  const results: any[] = [];
  const today = new Date();
  
  // 최근 6개월 데이터 조회 (더 많은 데이터)
  for (let i = 0; i < 6; i++) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // 서울대입구는 관악구 (11620)에 위치
    // 서울대입구는 관악구 (11620)에 위치
    const lawdCodes = lawdCd ? [lawdCd] : ['11620', '11680', '11650', '11200', '11110', '11710', '11740'];
    
    for (const code of lawdCodes) {
      try {
        const data = await getApartmentPrice(code, yearMonth);
        
        // 정확한 매칭 필터링
        const filtered = data.filter((item: any) => {
          // 1. 아파트명 정확히 일치 (공백 제거 후 비교)
          const itemName = (item.apartmentName || '').replace(/\s/g, '').toLowerCase();
          const searchName = apartmentName.replace(/\s/g, '').toLowerCase();
          
          // 아파트명이 정확히 일치하거나 서로 포함되어야 함
          if (!itemName.includes(searchName) && !searchName.includes(itemName)) {
            return false;
          }
          
          // 2. 동 정보 매칭 (있는 경우에만)
          if (dong) {
            // API 응답에서 동 정보 추출 (여러 소스에서 시도)
            let itemDong = item.dong || '';
            
            // dong 필드가 없으면 층 정보에서 추출
            if (!itemDong && item.floor) {
              const dongMatch = item.floor.match(/(\d+)동/);
              if (dongMatch) {
                itemDong = dongMatch[1];
              }
            }
            
            // 지번에서도 시도
            if (!itemDong && item.지번) {
              const dongMatch = item.지번.match(/(\d+)동/);
              if (dongMatch) {
                itemDong = dongMatch[1];
              }
            }
            
            // 사용자 입력 동 정보 정규화
            const searchDong = dong.replace(/동/g, '').replace(/\s/g, '').trim();
            
            // 동 정보가 있으면 정확히 일치해야 함
            if (itemDong && searchDong && itemDong !== searchDong) {
              return false;
            }
          }
          
          // 3. 면적 매칭 (±5% 이내)
          if (area && item.area) {
            const areaDiff = Math.abs(item.area - area) / area;
            if (areaDiff > 0.05) { // 5% 이내
              return false;
            }
          }
          
          return true;
        });
        
        results.push(...filtered);
      } catch (error) {
        // 에러는 무시하고 계속
      }
    }
  }
  
  // 정확도 순으로 정렬
  return results.sort((a, b) => {
    // 1. 아파트명 일치도 (정확히 일치하는 것 우선)
    const aNameMatch = (a.apartmentName || '').toLowerCase().startsWith(apartmentName.toLowerCase());
    const bNameMatch = (b.apartmentName || '').toLowerCase().startsWith(apartmentName.toLowerCase());
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;
    
    // 2. 면적 차이 (더 비슷한 것 우선)
    if (area) {
      const areaDiffA = Math.abs(a.area - area);
      const areaDiffB = Math.abs(b.area - area);
      if (areaDiffA !== areaDiffB) {
        return areaDiffA - areaDiffB;
      }
    }
    
    // 3. 최신순
    return new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime();
  });
}

function parseXML(xmlText: string): any[] {
  const results: any[] = [];
  
  // XML 에러 체크 (resultCode 확인)
  if (xmlText.includes('<resultCode>')) {
    const resultCode = extractTag(xmlText, 'resultCode');
    const resultMsg = extractTag(xmlText, 'resultMsg');
    
    // resultCode가 '00'이 아니면 에러 (단, item이 있을 수 있으므로 계속 진행)
    if (resultCode && resultCode !== '00' && resultCode !== '000') {
      // 에러 코드가 있어도 item이 있을 수 있으므로 계속 진행
    }
  }
  
  // item 태그 찾기 (더 정확한 정규식)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  let itemCount = 0;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    itemCount++;
    const itemXml = match[1];
    
    // 실제 API 응답 태그명 (영문) 사용
    const dealAmount = extractTag(itemXml, 'dealAmount');
    const aptNm     = extractTag(itemXml, 'aptNm');
    const umdNm     = extractTag(itemXml, 'umdNm');
    const jibun     = extractTag(itemXml, 'jibun');
    const dealYear  = extractTag(itemXml, 'dealYear');
    const dealMonth = extractTag(itemXml, 'dealMonth');
    const dealDay   = extractTag(itemXml, 'dealDay');
    const excluUseAr = extractTag(itemXml, 'excluUseAr');
    const floor     = extractTag(itemXml, 'floor');
    const buildYear = extractTag(itemXml, 'buildYear');
    const aptDong   = extractTag(itemXml, 'aptDong');

    if (aptNm && dealAmount) {
      // 거래금액은 만원 단위이므로 원으로 변환
      const priceStr = dealAmount.replace(/,/g, '').replace(/\s/g, '');
      const price = parseInt(priceStr) * 10000;

      if (!isNaN(price) && price > 0) {
        // 동 정보: aptDong 태그 우선, 없으면 jibun에서 추출
        let dong = aptDong.trim();

        // aptDong이 비어있으면 jibun에서 동 추출 시도
        if (!dong && jibun) {
          const dongMatch = jibun.match(/(\d+)동/);
          if (dongMatch) dong = dongMatch[1];
        }

        // 숫자만 남김 (예: "112동" → "112")
        dong = dong.replace(/동$/, '').trim();

        const floorNum = floor.trim();

        results.push({
          apartmentName: aptNm.trim(),
          address: umdNm.trim(),
          transactionPrice: price,
          transactionDate: `${dealYear.trim()}-${String(dealMonth.trim()).padStart(2, '0')}-${String(dealDay.trim()).padStart(2, '0')}`,
          area: parseFloat(excluUseAr || '0'),
          floor: floorNum,
          floorNumber: floorNum,
          buildYear: buildYear.trim(),
          dong: dong,
          ho: '',
          지번: jibun.trim(),
        });
      }
    }
  }
  
  return results;
}

function extractTag(xml: string, tagName: string): string {
  // 여러 패턴 시도
  const patterns = [
    new RegExp(`<${tagName}>([^<]*)<\/${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'i'),
    new RegExp(`<${tagName}\\s*>([^<]*)<\/${tagName}>`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim().replace(/\s+/g, ' ');
      // CDATA 섹션 제거
      if (value.startsWith('<![CDATA[') && value.endsWith(']]>')) {
        return value.slice(9, -3).trim();
      }
      return value;
    }
  }
  
  return '';
}
