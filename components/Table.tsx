'use client';

import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;
export type Column<T> = {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
};

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
}

export default function Table<T extends Record<string, any>>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = '검색...',
  className = '',
}: TableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<keyof T | string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    return data.filter((row) =>
      Object.values(row).some((value) =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, searchTerm]);

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn as keyof T];
      const bVal = b[sortColumn as keyof T];

      if (aVal === bVal) return 0;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection]);

  const handleSort = (columnKey: keyof T | string) => {
    if (sortColumn === columnKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('ko-KR').format(value);
  };

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {searchable && (
        <div className="p-4 border-b border-gray-100 bg-gray-50/30">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50/80">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100 ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''
                  }`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-1.5">
                    {column.label}
                    {column.sortable && (
                      <div className="flex flex-col text-[8px] leading-[4px]">
                        <span className={`${sortColumn === column.key && sortDirection === 'asc' ? 'text-blue-500' : 'text-gray-300'}`}>▲</span>
                        <span className={`${sortColumn === column.key && sortDirection === 'desc' ? 'text-blue-500' : 'text-gray-300'}`}>▼</span>
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-400 text-sm italic">
                  데이터가 없습니다
                </td>
              </tr>
            ) : (
              sortedData.map((row, idx) => (
                <tr key={idx} className="group hover:bg-blue-50/30 transition-colors">
                  {columns.map((column) => {
                    const value = row[column.key as keyof T];
                    return (
                      <td key={String(column.key)} className="px-6 py-4 text-sm text-gray-600 font-medium">
                        {column.render
                          ? column.render(value, row)
                          : typeof value === 'number'
                          ? formatNumber(value)
                          : String(value || '')}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
