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

  const handleMobileSort = (value: string) => {
    if (!value) {
      setSortColumn(null);
      setSortDirection(null);
      return;
    }

    const separatorIndex = value.lastIndexOf(':');
    setSortColumn(value.slice(0, separatorIndex));
    setSortDirection(value.slice(separatorIndex + 1) as Exclude<SortDirection, null>);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('ko-KR').format(value);
  };

  const renderValue = (row: T, column: Column<T>) => {
    const value = row[column.key as keyof T];
    if (column.render) return column.render(value, row);
    if (typeof value === 'number') return formatNumber(value);
    return value == null ? '' : String(value);
  };

  const sortableColumns = columns.filter((column) => column.sortable);
  const mobileSortValue = sortColumn && sortDirection ? `${String(sortColumn)}:${sortDirection}` : '';
  const wrappingLabels = new Set([
    '주소',
    '내용',
    '비고',
    'ETF명',
    '주식명',
    '자산명',
    '부채명',
    '아파트명',
    '항목명',
    '현금명',
    '수입원',
  ]);

  return (
    <div className={`min-w-0 max-w-full sm:overflow-hidden sm:rounded-lg sm:border sm:border-gray-100 sm:bg-white sm:shadow-sm ${className}`}>
      {searchable && (
        <div className="hidden border-b border-gray-100 bg-gray-50/30 p-4 sm:block">
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

      {(searchable || sortableColumns.length > 0) && (
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:hidden">
          {searchable ? (
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400" aria-hidden="true">⌕</span>
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          ) : (
            <div />
          )}
          {sortableColumns.length > 0 && (
            <select
              aria-label="정렬 기준"
              value={mobileSortValue}
              onChange={(event) => handleMobileSort(event.target.value)}
              className="h-11 max-w-[9rem] rounded-lg border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">기본 정렬</option>
              {sortableColumns.flatMap((column) => [
                <option key={`${String(column.key)}-asc`} value={`${String(column.key)}:asc`}>{column.label} ↑</option>,
                <option key={`${String(column.key)}-desc`} value={`${String(column.key)}:desc`}>{column.label} ↓</option>,
              ])}
            </select>
          )}
        </div>
      )}

      <div className="space-y-3 sm:hidden">
        {sortedData.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
            데이터가 없습니다
          </div>
        ) : (
          sortedData.map((row, rowIndex) => {
            const actionColumn = columns.find((column) => column.label === '작업' || column.label === '관리');
            const identityColumns = columns.filter((column) => column !== actionColumn).slice(0, 2);
            const dataColumns = columns.filter((column) => column !== actionColumn).slice(2);
            const summaryColumns = dataColumns.slice(0, 4);
            const detailColumns = dataColumns.slice(4);

            const renderMobileField = (column: Column<T>) => {
              return (
                <div key={String(column.key)} className="min-w-0">
                  <div className="shrink-0 text-[13px] font-bold text-gray-400">{column.label}</div>
                  <div className={`mt-1 min-w-0 text-base font-semibold leading-6 text-gray-700 ${
                    wrappingLabels.has(column.label) ? '[overflow-wrap:anywhere]' : 'whitespace-nowrap'
                  }`}>
                    {renderValue(row, column)}
                  </div>
                </div>
              );
            };

            return (
              <article key={String(row.id ?? rowIndex)} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="border-b border-gray-100 pb-3">
                  <div className="text-lg font-extrabold leading-6 text-gray-950">
                    {identityColumns[0] ? renderValue(row, identityColumns[0]) : `항목 ${rowIndex + 1}`}
                  </div>
                  {identityColumns[1] && (
                    <div className="mt-1 text-sm font-medium leading-5 text-gray-500 [overflow-wrap:anywhere]">
                      {renderValue(row, identityColumns[1])}
                    </div>
                  )}
                </div>

                {summaryColumns.length > 0 && (
                  <div className={`mt-3 grid gap-y-3 ${
                    summaryColumns.length === 3
                      ? 'grid-cols-[minmax(0,1.4fr)_minmax(0,0.65fr)_minmax(0,1fr)] gap-x-2 [&>div>div:last-child]:text-[14px]'
                      : 'grid-cols-2 gap-x-4'
                  }`}>
                    {summaryColumns.map(renderMobileField)}
                  </div>
                )}

                {detailColumns.length > 0 && (
                  <details className="mt-3 border-t border-gray-100 pt-2">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-bold text-blue-600">
                      상세 정보 보기
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
                      {detailColumns.map(renderMobileField)}
                    </div>
                  </details>
                )}

                {actionColumn && (
                  <div className="mt-3 border-t border-gray-100 pt-3 [&_button]:min-h-11 [&_button]:px-4 [&_button]:text-sm [&>div]:flex-wrap">
                    {renderValue(row, actionColumn)}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-max min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-50/80">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  aria-sort={column.sortable && sortColumn === column.key
                    ? sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none'
                    : undefined}
                  className="whitespace-nowrap border-b border-gray-100 px-3 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-gray-500 xl:px-4"
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 text-left transition-colors hover:text-gray-700"
                      onClick={() => handleSort(column.key)}
                    >
                      {column.label}
                      <div className="flex flex-col text-[8px] leading-[4px]">
                        <span className={`${sortColumn === column.key && sortDirection === 'asc' ? 'text-blue-500' : 'text-gray-300'}`}>▲</span>
                        <span className={`${sortColumn === column.key && sortDirection === 'desc' ? 'text-blue-500' : 'text-gray-300'}`}>▼</span>
                      </div>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400 text-sm italic">
                  데이터가 없습니다
                </td>
              </tr>
            ) : (
              sortedData.map((row, idx) => (
                <tr key={idx} className="group hover:bg-blue-50/30 transition-colors">
                  {columns.map((column) => {
                    return (
                      <td key={String(column.key)} className="whitespace-nowrap px-3 py-3 text-sm text-gray-600 font-medium xl:px-4 [&_button]:whitespace-nowrap">
                        {renderValue(row, column)}
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
