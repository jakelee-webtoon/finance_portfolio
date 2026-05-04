'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: '대시보드' },
    { href: '/portfolio', label: '포트폴리오' },
    { href: '/apartment', label: '아파트' },
    { href: '/stocks', label: '주식' },
    { href: '/rsu', label: 'RSU' },
    { href: '/cash', label: '현금' },
    { href: '/income', label: '수입' },
    { href: '/salary', label: '연봉' },
    { href: '/ledger', label: '가계부' },
  ];

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 sticky top-[65px] z-40 overflow-x-auto no-scrollbar">
      <div className="flex space-x-1 max-w-7xl mx-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-4 text-sm font-bold transition-all whitespace-nowrap border-b-2 ${
              pathname === item.href || (item.href === '/dashboard' && (pathname === '/' || pathname === ''))
                ? 'text-blue-600 border-blue-600 bg-blue-50/30'
                : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50/50'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
