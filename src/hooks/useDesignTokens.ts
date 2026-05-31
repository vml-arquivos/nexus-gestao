// src/hooks/useDesignTokens.ts
// Motor do editor visual — lê, aplica e persiste tokens de design
// Sem dependências externas. 100% nativo.

export interface DesignTokens {
  // Cores
  primary: string
  secondary: string
  success: string
  warning: string
  danger: string
  // Backgrounds
  bg: string
  bg2: string
  bg3: string
  bg4: string
  // Textos
  text: string
  text2: string
  text3: string
  // Tipografia
  fontBody: string
  fontHeading: string
  textXs: string
  textSm: string
  textBase: string
  textMd: string
  textLg: string
  textXl: string
  text2xl: string
  // Pesos
  fwNormal: string
  fwMedium: string
  fwSemibold: string
  fwBold: string
  fwBlack: string
  // Raios
  radiusXs: string
  radiusSm: string
  radius: string
  radiusLg: string
  radiusXl: string
  // Layout
  sidebarW: string
  topbarH: string
  bottomNavH: string
  pagePad: string
  cardPad: string
  // Sombras
  shadowSm: string
  shadowMd: string
  shadowLg: string
  // Gradiente
  gradPrimary: string
  // Transições
  transitionFast: string
  transitionBase: string
  transitionSlow: string
  // Bordas
  border: string
  border2: string
}

export const STORAGE_KEY = 'nexus_design_tokens'

// Tokens padrão do sistema (espelha theme.css)
export const DEFAULT_TOKENS: DesignTokens = {
  primary: '#5b7cfa',
  secondary: '#38bdf8',
  success: '#34d399',
  warning: '#fb923c',
  danger: '#f87171',
  bg: '#f6f7fb',
  bg2: '#ffffff',
  bg3: '#f1f4f8',
  bg4: '#e5eaf2',
  text: '#0a0c10',
  text2: '#515c72',
  text3: '#8892a8',
  fontBody: "'Geist','Inter',sans-serif",
  fontHeading: "'Geist','Inter',sans-serif",
  textXs: '0.75rem',
  textSm: '0.85rem',
  textBase: '0.92rem',
  textMd: '1.0rem',
  textLg: '1.1rem',
  textXl: '1.25rem',
  text2xl: '1.6rem',
  fwNormal: '400',
  fwMedium: '500',
  fwSemibold: '600',
  fwBold: '600',
  fwBlack: '700',
  radiusXs: '4px',
  radiusSm: '6px',
  radius: '10px',
  radiusLg: '16px',
  radiusXl: '20px',
  sidebarW: '220px',
  topbarH: '56px',
  bottomNavH: '60px',
  pagePad: '20px',
  cardPad: '16px',
  shadowSm: '0 1px 6px rgba(0,0,0,0.08)',
  shadowMd: '0 4px 16px rgba(0,0,0,0.10)',
  shadowLg: '0 8px 32px rgba(0,0,0,0.12)',
  gradPrimary: 'linear-gradient(135deg,#5b7cfa 0%,#38bdf8 100%)',
  transitionFast: '0.12s ease',
  transitionBase: '0.2s ease',
  transitionSlow: '0.35s ease',
  border: 'rgba(10,12,16,0.08)',
  border2: 'rgba(10,12,16,0.12)',
}

// Mapeia token key → CSS variable name
export const TOKEN_TO_CSS: Record<keyof DesignTokens, string> = {
  primary: '--primary',
  secondary: '--secondary',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  bg: '--bg',
  bg2: '--bg2',
  bg3: '--bg3',
  bg4: '--bg4',
  text: '--text',
  text2: '--text2',
  text3: '--text3',
  fontBody: '--font-body',
  fontHeading: '--font-heading',
  textXs: '--text-xs',
  textSm: '--text-sm',
  textBase: '--text-base',
  textMd: '--text-md',
  textLg: '--text-lg',
  textXl: '--text-xl',
  text2xl: '--text-2xl',
  fwNormal: '--fw-normal',
  fwMedium: '--fw-medium',
  fwSemibold: '--fw-semibold',
  fwBold: '--fw-bold',
  fwBlack: '--fw-black',
  radiusXs: '--radius-xs',
  radiusSm: '--radius-sm',
  radius: '--radius',
  radiusLg: '--radius-lg',
  radiusXl: '--radius-xl',
  sidebarW: '--sidebar-w',
  topbarH: '--topbar-h',
  bottomNavH: '--bottom-nav-h',
  pagePad: '--page-pad',
  cardPad: '--card-pad',
  shadowSm: '--shadow-sm',
  shadowMd: '--shadow-md',
  shadowLg: '--shadow-lg',
  gradPrimary: '--grad-primary',
  transitionFast: '--transition-fast',
  transitionBase: '--transition-base',
  transitionSlow: '--transition-slow',
  border: '--border',
  border2: '--border2',
}

/** Aplica um token imediatamente no :root sem rebuild */
export function applyToken(key: keyof DesignTokens, value: string): void {
  const cssVar = TOKEN_TO_CSS[key]
  if (!cssVar) return
  document.documentElement.style.setProperty(cssVar, value)

  // Derivados automáticos
  if (key === 'primary') {
    document.documentElement.style.setProperty('--primary-hover', shadeColor(value, -15))
    document.documentElement.style.setProperty('--primary-light', shadeColor(value, 30))
    document.documentElement.style.setProperty('--primary-dim', hexToRgba(value, 0.12))
    document.documentElement.style.setProperty('--primary-dim2', hexToRgba(value, 0.06))
    document.documentElement.style.setProperty('--primary-glow', hexToRgba(value, 0.25))
    document.documentElement.style.setProperty('--color-primary', value)
  }
  if (key === 'success') document.documentElement.style.setProperty('--success-dim', hexToRgba(value, 0.10))
  if (key === 'warning') document.documentElement.style.setProperty('--warning-dim', hexToRgba(value, 0.10))
  if (key === 'danger')  document.documentElement.style.setProperty('--danger-dim', hexToRgba(value, 0.10))
  if (key === 'secondary') document.documentElement.style.setProperty('--secondary-dim', hexToRgba(value, 0.14))
}

/** Aplica todos os tokens de um objeto */
export function applyAllTokens(tokens: Partial<DesignTokens>): void {
  (Object.keys(tokens) as (keyof DesignTokens)[]).forEach(key => {
    applyToken(key, tokens[key]!)
  })
}

/** Salva tokens no localStorage */
export function saveTokens(tokens: DesignTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

/** Carrega tokens do localStorage */
export function hasSavedDesignTokens(): boolean {
  try { return Boolean(localStorage.getItem(STORAGE_KEY)) } catch { return false }
}

/** Carrega tokens salvos. Retorna null quando não existe tema personalizado salvo. */
export function loadSavedTokens(): DesignTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return { ...DEFAULT_TOKENS, ...JSON.parse(raw) }
  } catch {
    return null
  }
}

export function loadTokens(): DesignTokens {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TOKENS }
    return { ...DEFAULT_TOKENS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_TOKENS }
  }
}

/** Reseta tudo para o padrão */
export function resetTokens(): DesignTokens {
  localStorage.removeItem(STORAGE_KEY)
  applyAllTokens(DEFAULT_TOKENS)
  return { ...DEFAULT_TOKENS }
}

/** Gera o CSS exportável do tema customizado */
export function exportTokensAsCSS(tokens: DesignTokens): string {
  const lines = (Object.keys(tokens) as (keyof DesignTokens)[]).map(key => {
    const cssVar = TOKEN_TO_CSS[key]
    return `  ${cssVar}: ${tokens[key]};`
  })
  return `:root {\n${lines.join('\n')}\n}\n`
}

// ── Utils de cor ──────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  try {
    const clean = hex.replace('#', '')
    const r = parseInt(clean.substring(0, 2), 16)
    const g = parseInt(clean.substring(2, 4), 16)
    const b = parseInt(clean.substring(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  } catch { return hex }
}

function shadeColor(hex: string, percent: number): string {
  try {
    const clean = hex.replace('#', '')
    const num = parseInt(clean, 16)
    const r = Math.min(255, Math.max(0, (num >> 16) + percent * 2.55))
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent * 2.55))
    const b = Math.min(255, Math.max(0, (num & 0xff) + percent * 2.55))
    return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`
  } catch { return hex }
}
