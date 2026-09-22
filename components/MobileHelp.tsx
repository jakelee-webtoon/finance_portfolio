import { ReactNode } from 'react';

interface MobileHelpProps {
  label: string;
  children: ReactNode;
}

export default function MobileHelp({ label, children }: MobileHelpProps) {
  return (
    <details className="group relative md:hidden">
      <summary
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full bg-gray-100 text-base font-extrabold text-gray-600 active:bg-gray-200 [&::-webkit-details-marker]:hidden"
        aria-label={`${label} 도움말`}
      >
        ?
      </summary>
      <div className="fixed left-4 right-4 top-24 z-[75] rounded-lg border border-gray-200 bg-white p-4 text-sm font-medium leading-6 text-gray-600 shadow-xl">
        {children}
      </div>
    </details>
  );
}
