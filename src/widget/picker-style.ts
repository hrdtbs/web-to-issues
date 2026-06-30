import { sanitizeCssColor, sanitizeCssFontFamily, sanitizeNonNegativePixelValue } from './sanitize';

const PICKER_ACCENT = '#18181b';

export interface PickerStyle {
  accentColor?: string;
  font?: string;
  radius?: string;
  borderWidth?: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  theme?: string;
}

export interface ResolvedPickerStyle {
  accent: string;
  fontFamily: string;
  radius: string;
  bw: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
}

export function resolvePickerStyle(style?: PickerStyle): ResolvedPickerStyle {
  const isDark = style?.theme === 'dark';
  const radius = sanitizeNonNegativePixelValue(style?.radius);
  const borderWidth = sanitizeNonNegativePixelValue(style?.borderWidth);
  const fontFamily = sanitizeCssFontFamily(style?.font);

  return {
    accent: sanitizeCssColor(style?.accentColor) || PICKER_ACCENT,
    fontFamily:
      style?.font === 'inherit'
        ? 'system-ui, sans-serif'
        : fontFamily || "'Space Grotesk', system-ui, sans-serif",
    radius: radius !== undefined ? `${radius}px` : '6px',
    bw: borderWidth !== undefined ? String(borderWidth) : '3',
    tooltipBg: sanitizeCssColor(style?.bgColor) || (isDark ? '#0f172a' : '#1a1a1a'),
    tooltipText: sanitizeCssColor(style?.textColor) || '#f1f5f9',
    tooltipBorder: sanitizeCssColor(style?.borderColor) || (isDark ? '#334155' : '#333'),
  };
}
