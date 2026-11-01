import type { LedgerEntry } from '../types';
import { previousMonth } from './calendar';

function recurringId(entry: LedgerEntry, month: string): string {
  const root = entry.id.replace(/^ledger-fixed-\d{4}-\d{2}-/, '');
  return `ledger-fixed-${month}-${root}`;
}

export function buildMissingFixedEntries(entries: LedgerEntry[], targetMonth: string, today: string, modifiedBy: 'husband' | 'wife'): LedgerEntry[] {
  const current = entries.filter(entry => entry.month === targetMonth);
  const previous = entries.filter(entry => entry.month === previousMonth(targetMonth) && entry.is_fixed);
  const used = new Set<string>();
  return previous.flatMap(source => {
    const id = recurringId(source, targetMonth);
    if (current.some(entry => entry.id === id)) return [];
    // Legacy copies have random IDs. Match each old row at most once and ignore
    // the editable amount so editing this month's bill does not recreate it.
    const candidates = current.filter(entry => !used.has(entry.id) && !entry.id.startsWith('ledger-fixed-') && entry.is_fixed &&
      entry.type === source.type && entry.category === source.category && entry.owner === source.owner &&
      (entry.subcategory || '') === (source.subcategory || ''));
    const existing = candidates.find(entry => entry.amount === source.amount) || candidates[0];
    if (existing) { used.add(existing.id); return []; }
    return [{ ...source, id, month: targetMonth, date: `${targetMonth}-01`, as_of_date: today, last_modified_by: modifiedBy }];
  });
}
