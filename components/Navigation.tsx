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
  ];

  return (
    <nav className="bg-white border-b border-gray-200 px-6 sticky top-[65px] z-40">
      <div className="flex space-x-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              pathname === item.href || (item.href === '/dashboard' && pathname === '/')
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
