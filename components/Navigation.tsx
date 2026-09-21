'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { href: '/dashboard', label: '대시보드' },
    { href: '/portfolio', label: '포트폴리오' },
    { href: '/apartment', label: '아파트' },
    { href: '/stocks', label: '주식' },
    { href: '/isa', label: 'ISA' },
    { href: '/rsu', label: 'RSU' },
    { href: '/cash', label: '현금' },
    { href: '/income', label: '수입' },
    { href: '/salary', label: '연봉' },
    { href: '/monthly-plan', label: '월간플랜' },
    { href: '/ledger', label: '가계부' },
  ];

  const currentItem = navItems.find((item) =>
    pathname === item.href || (item.href === '/dashboard' && (pathname === '/' || pathname === ''))
  ) ?? navItems[0];

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  return (
    <>
      {isMenuOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      <nav className="top-navigation relative sticky z-40 max-w-full min-w-0 border-b border-gray-200 bg-white/95 backdrop-blur-md">
        <div className="flex h-12 items-center justify-between px-3 md:hidden">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-gray-400">현재 메뉴</div>
            <div className="truncate text-sm font-bold text-gray-900">{currentItem.label}</div>
          </div>
          <button
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-navigation-menu"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm"
          >
            <span aria-hidden="true" className="text-lg leading-none">{isMenuOpen ? '×' : '☰'}</span>
            메뉴
          </button>
        </div>

        {isMenuOpen && (
          <div
            id="mobile-navigation-menu"
            className="absolute inset-x-0 top-full border-b border-gray-200 bg-white p-3 shadow-lg md:hidden"
          >
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">
              {navItems.map((item) => {
                const isActive = currentItem.href === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-11 items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="hidden overflow-x-auto no-scrollbar overscroll-x-contain touch-pan-x px-2 md:block sm:px-4">
          <div className="mx-auto flex max-w-7xl min-w-max space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-bold transition-all ${
                  pathname === item.href || (item.href === '/dashboard' && (pathname === '/' || pathname === ''))
                    ? 'border-blue-600 bg-blue-50/30 text-blue-600'
                    : 'border-transparent text-gray-400 hover:bg-gray-50/50 hover:text-gray-600'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
