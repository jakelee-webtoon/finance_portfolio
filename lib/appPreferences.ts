export type AppFontSize = 'small' | 'medium' | 'large';
export type AppSpacing = 'compact' | 'medium' | 'wide';

export interface AppPreferences {
  fontSize: AppFontSize;
  spacing: AppSpacing;
}

export const APP_PREFERENCES_KEY = 'finance-app-preferences';

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  fontSize: 'medium',
  spacing: 'medium',
};

const isFontSize = (value: unknown): value is AppFontSize =>
  value === 'small' || value === 'medium' || value === 'large';

const isSpacing = (value: unknown): value is AppSpacing =>
  value === 'compact' || value === 'medium' || value === 'wide';

export function getAppPreferences(): AppPreferences {
  if (typeof window === 'undefined') return DEFAULT_APP_PREFERENCES;

  try {
    const stored = JSON.parse(localStorage.getItem(APP_PREFERENCES_KEY) || '{}');
    return {
      fontSize: isFontSize(stored.fontSize) ? stored.fontSize : DEFAULT_APP_PREFERENCES.fontSize,
      spacing: isSpacing(stored.spacing) ? stored.spacing : DEFAULT_APP_PREFERENCES.spacing,
    };
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

export function applyAppPreferences(preferences: AppPreferences): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.appFontSize = preferences.fontSize;
  document.documentElement.dataset.appSpacing = preferences.spacing;
}

export function saveAppPreferences(preferences: AppPreferences): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(APP_PREFERENCES_KEY, JSON.stringify(preferences));
  applyAppPreferences(preferences);
}
