export type ThemeMode = 'auto';
export type ResolvedTheme = 'light' | 'dark';

export function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function resolveTheme(getSystem: () => ResolvedTheme = getSystemTheme): ResolvedTheme {
  return getSystem();
}

export function applyThemeClass(root: HTMLElement, resolved: ResolvedTheme): void {
  root.classList.toggle('wti-dark', resolved === 'dark');
}

export function attachSystemThemeListener(
  onSystemChange: (resolved: ResolvedTheme) => void
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    onSystemChange(e.matches ? 'dark' : 'light');
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
