'use client';

import { type CSSProperties, type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuDragY, setMenuDragY] = useState(0);
  const [isMenuDragging, setIsMenuDragging] = useState(false);
  const menuDragRef = useRef({
    pointerId: -1,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    dragY: 0,
    velocity: 0,
    hasMoved: false,
  });
  const suppressMenuClickRef = useRef(false);

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

  const primaryNavItems = [
    { href: '/dashboard', label: '홈', icon: '⌂' },
    { href: '/isa', label: 'ISA', icon: '$' },
    { href: '/rsu', label: 'RSU', icon: 'R' },
    { href: '/monthly-plan', label: '플랜', icon: '✓' },
  ];
  const isPrimaryRoute = primaryNavItems.some((item) => item.href === currentItem.href);

  useEffect(() => {
    setIsMenuOpen(false);
    setMenuDragY(0);
    setIsMenuDragging(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.add('has-mobile-navigation');
    return () => document.body.classList.remove('has-mobile-navigation');
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleMenuPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const now = performance.now();
    menuDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: now,
      dragY: 0,
      velocity: 0,
      hasMoved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMenuPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = menuDragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const nextDragY = Math.max(0, event.clientY - drag.startY);
    const now = performance.now();
    const elapsed = Math.max(now - drag.lastTime, 1);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = now;
    drag.dragY = nextDragY;

    if (!drag.hasMoved && nextDragY < 8) return;
    drag.hasMoved = true;
    setIsMenuDragging(true);
    setMenuDragY(nextDragY);
  };

  const handleMenuPointerEnd = (event: PointerEvent<HTMLElement>) => {
    const drag = menuDragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const shouldClose = drag.dragY > 96 || (drag.dragY > 32 && drag.velocity > 0.65);
    suppressMenuClickRef.current = drag.hasMoved;
    menuDragRef.current.pointerId = -1;
    setIsMenuDragging(false);

    if (shouldClose) {
      setIsMenuOpen(false);
    }

    setMenuDragY(0);
  };

  const handleMenuClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!suppressMenuClickRef.current) return;
    suppressMenuClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      {isMenuOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-[55] bg-gray-950/35 backdrop-blur-[1px] md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      <nav className="top-navigation sticky z-40 hidden max-w-full min-w-0 border-b border-gray-200 bg-white/95 backdrop-blur-md md:block">
        <div className="overflow-x-auto no-scrollbar overscroll-x-contain touch-pan-x px-2 sm:px-4">
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

      {isMenuOpen && (
        <section
          id="mobile-navigation-menu"
          className={`mobile-navigation-menu fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] rounded-t-2xl bg-white px-4 pb-5 pt-3 shadow-2xl md:hidden ${
            isMenuDragging ? 'mobile-navigation-menu--dragging' : ''
          }`}
          style={{ '--menu-drag-y': `${menuDragY}px` } as CSSProperties}
          aria-label="전체 메뉴"
          onPointerDown={handleMenuPointerDown}
          onPointerMove={handleMenuPointerMove}
          onPointerUp={handleMenuPointerEnd}
          onPointerCancel={handleMenuPointerEnd}
          onClickCapture={handleMenuClickCapture}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" aria-hidden="true" />
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <h2 className="text-xl font-extrabold text-gray-950">전체 메뉴</h2>
              <p className="mt-0.5 text-sm text-gray-500">{currentItem.label} 보는 중</p>
            </div>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-2xl leading-none text-gray-600"
              aria-label="메뉴 닫기"
            >
              ×
            </button>
          </div>
          <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
            {navItems.map((item) => {
              const isActive = currentItem.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-12 items-center justify-center rounded-lg px-2 py-3 text-sm font-bold transition-colors ${
                    isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <nav className="mobile-bottom-navigation fixed inset-x-0 bottom-0 z-[70] border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden" aria-label="주요 메뉴">
        <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5 px-1">
          {primaryNavItems.map((item) => {
            const isActive = currentItem.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[13px] font-bold ${
                  isActive ? 'text-blue-600' : 'text-gray-400'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span aria-hidden="true" className="text-[22px] font-normal leading-6">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-navigation-menu"
            onClick={() => setIsMenuOpen((open) => !open)}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[13px] font-bold ${
              !isPrimaryRoute || isMenuOpen ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            <span aria-hidden="true" className="text-[24px] font-normal leading-6">{isMenuOpen ? '×' : '⋯'}</span>
            <span>전체</span>
          </button>
        </div>
      </nav>
    </>
  );
}
