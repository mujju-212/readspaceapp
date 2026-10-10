export type ThemeName = 'ice' | 'light' | 'dark' | 'sepia';

export interface ThemeColors {
  name: ThemeName;
  bg: string;
  panel: string;
  card: string;
  border: string;
  fg: string;
  muted: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  sel: string;
  hover: string;
  pdfBg: string;
  statusWarn: string;
  success: string;
  error: string;
  tabbar: string;
  primary: string;

  // Aliases for modern screens
  surface: string;
  text: string;
  textSecondary: string;
  textMuted: string;
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  ice: {
    name: 'ice',
    bg: '#f2f8ff',
    panel: '#ffffff',
    card: '#ffffff',
    surface: '#ffffff',
    border: '#d7e6f7',
    fg: '#14233b',
    text: '#14233b',
    muted: '#5b6b82',
    textSecondary: '#5b6b82',
    textMuted: '#5b6b82',
    accent: '#356ae6',
    primary: '#356ae6',
    accentFg: '#ffffff',
    accentSoft: '#6ea8f7',
    sel: '#dbe9fb',
    hover: 'rgba(53, 106, 230, 0.08)',
    pdfBg: '#e4eefb',
    statusWarn: '#b45309',
    success: '#1a7f37',
    error: '#c62828',
    tabbar: '#eaf3ff',
  },
  light: {
    name: 'light',
    bg: '#fafafa',
    panel: '#ffffff',
    card: '#ffffff',
    surface: '#ffffff',
    border: '#dcdfe5',
    fg: '#1c2130',
    text: '#1c2130',
    muted: '#5f6875',
    textSecondary: '#5f6875',
    textMuted: '#5f6875',
    accent: '#4f5ed1',
    primary: '#4f5ed1',
    accentFg: '#ffffff',
    accentSoft: '#7b87e6',
    sel: '#dbe9fb',
    hover: 'rgba(9, 105, 218, 0.08)',
    pdfBg: '#e8eaed',
    statusWarn: '#b45309',
    success: '#1a7f37',
    error: '#c62828',
    tabbar: '#ececef',
  },
  dark: {
    name: 'dark',
    bg: '#0e1526',
    panel: '#16203a',
    card: '#16203a',
    surface: '#16203a',
    border: '#24314f',
    fg: '#dce6f5',
    text: '#dce6f5',
    muted: '#8fa0bd',
    textSecondary: '#8fa0bd',
    textMuted: '#8fa0bd',
    accent: '#5b8def',
    primary: '#5b8def',
    accentFg: '#0a1120',
    accentSoft: '#8ab4f8',
    sel: '#223655',
    hover: 'rgba(110, 168, 247, 0.1)',
    pdfBg: '#182238',
    statusWarn: '#f0b429',
    success: '#3fb950',
    error: '#f85149',
    tabbar: '#101a33',
  },
  sepia: {
    name: 'sepia',
    bg: '#f6edd9',
    panel: '#efe4cb',
    card: '#efe4cb',
    surface: '#efe4cb',
    border: '#d8c6a0',
    fg: '#43382a',
    text: '#43382a',
    muted: '#7c6d54',
    textSecondary: '#7c6d54',
    textMuted: '#7c6d54',
    accent: '#9c6b1e',
    primary: '#9c6b1e',
    accentFg: '#fff9ec',
    accentSoft: '#c2903f',
    sel: '#e7d3a7',
    hover: 'rgba(156, 107, 30, 0.1)',
    pdfBg: '#ded0b0',
    statusWarn: '#a16207',
    success: '#1a7f37',
    error: '#c62828',
    tabbar: '#e7d9ba',
  },
};
