// src/pages/DesignEditor.tsx
// Editor Visual Nativo do Nexus — 100% exclusivo, zero dependências externas
// Edita tokens de design em tempo real com preview ao vivo no sistema inteiro

import { useState, useCallback, useRef } from 'react'
import type { ElementType, ReactNode } from 'react'
import {
  Palette, Type, Layout, Sliders, Download, RotateCcw,
  Check, ChevronRight, Eye, Code, Smartphone, Monitor,
  Copy, Wand2, Sun, Moon, Layers, ArrowLeft, Info,
} from 'lucide-react'
import {
  DEFAULT_TOKENS, loadTokens, saveTokens, resetTokens,
  applyToken, applyAllTokens, exportTokensAsCSS,
  type DesignTokens,
} from '../hooks/useDesignTokens'

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(0);
    background:${type === 'error' ? '#f87171' : '#34d399'};
    color:${type === 'error' ? '#fff' : '#0a2a1a'};
    padding:10px 24px;border-radius:12px;font-size:13px;font-weight:700;
    z-index:99999;box-shadow:0 4px 24px rgba(0,0,0,0.3);
    animation:toastPop .2s ease;white-space:nowrap;
  `
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2800)
}

// ── Presets de tema prontos ────────────────────────────────────────
const PRESETS: { name: string; emoji: string; tokens: Partial<DesignTokens> }[] = [
  {
    name: 'Nexus Original', emoji: '⚡',
    tokens: { primary: '#5b7cfa', secondary: '#38bdf8', bg: '#f6f7fb', bg2: '#ffffff', text: '#0a0c10', radius: '10px' },
  },
  {
    name: 'Dark Pro', emoji: '🌑',
    tokens: { primary: '#818cf8', secondary: '#22d3ee', bg: '#0a0c10', bg2: '#13161d', bg3: '#1c2030', bg4: '#252a38', text: '#f0f2f7', text2: '#8892a8', text3: '#515c72', border: 'rgba(255,255,255,0.06)', border2: 'rgba(255,255,255,0.10)' },
  },
  {
    name: 'Esmeralda', emoji: '💚',
    tokens: { primary: '#10b981', secondary: '#34d399', bg: '#f0fdf4', bg2: '#ffffff', text: '#064e3b', radius: '8px', gradPrimary: 'linear-gradient(135deg,#10b981 0%,#34d399 100%)' },
  },
  {
    name: 'Rosa Neon', emoji: '🌸',
    tokens: { primary: '#ec4899', secondary: '#f472b6', bg: '#fff1f2', bg2: '#ffffff', text: '#4a0020', radius: '16px', gradPrimary: 'linear-gradient(135deg,#ec4899 0%,#f472b6 100%)' },
  },
  {
    name: 'Laranja Fogo', emoji: '🔥',
    tokens: { primary: '#f97316', secondary: '#fb923c', bg: '#fff7ed', bg2: '#ffffff', text: '#431407', radius: '6px', gradPrimary: 'linear-gradient(135deg,#f97316 0%,#fb923c 100%)' },
  },
  {
    name: 'Violeta', emoji: '🔮',
    tokens: { primary: '#8b5cf6', secondary: '#a78bfa', bg: '#faf5ff', bg2: '#ffffff', text: '#2e1065', radius: '14px', gradPrimary: 'linear-gradient(135deg,#7c3aed 0%,#a78bfa 100%)' },
  },
  {
    name: 'Minimalista', emoji: '⬜',
    tokens: { primary: '#111827', secondary: '#374151', bg: '#ffffff', bg2: '#f9fafb', bg3: '#f3f4f6', text: '#111827', radius: '4px', gradPrimary: 'linear-gradient(135deg,#111827 0%,#374151 100%)' },
  },
  {
    name: 'Ciano Tech', emoji: '🤖',
    tokens: { primary: '#06b6d4', secondary: '#22d3ee', bg: '#f0fdff', bg2: '#ffffff', text: '#083344', radius: '8px', gradPrimary: 'linear-gradient(135deg,#0891b2 0%,#22d3ee 100%)' },
  },
]

const FONTS = [
  { label: 'Geist (Padrão)', value: "'Geist','Inter',sans-serif" },
  { label: 'Inter', value: "'Inter',sans-serif" },
  { label: 'Poppins', value: "'Poppins',sans-serif" },
  { label: 'Montserrat', value: "'Montserrat',sans-serif" },
  { label: 'Roboto', value: "'Roboto',sans-serif" },
  { label: 'Nunito', value: "'Nunito',sans-serif" },
  { label: 'DM Sans', value: "'DM Sans',sans-serif" },
  { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans',sans-serif" },
  { label: 'Outfit', value: "'Outfit',sans-serif" },
  { label: 'Syne', value: "'Syne',sans-serif" },
]

// ── Componente Color Picker ────────────────────────────────────────
function ColorField({ label, value, onChange, desc }: {
  label: string; value: string; onChange: (v: string) => void; desc?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => inputRef.current?.click()}
        style={{ width: 36, height: 36, borderRadius: 10, background: value, border: '2px solid var(--border2)', cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'transform .1s' }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      />
      <input ref={inputRef} type="color" value={value} onChange={e => onChange(e.target.value)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value) }}
        style={{ width: 76, fontSize: 12, fontFamily: 'monospace', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', outline: 'none', textAlign: 'center' }}
      />
    </div>
  )
}

// ── Componente Slider ─────────────────────────────────────────────
function SliderField({ label, value, unit, min, max, step = 1, onChange, desc }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number
  onChange: (v: number) => void; desc?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
          {desc && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>{desc}</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', minWidth: 48, textAlign: 'right' }}>
          {value}{unit}
        </div>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'var(--bg4)', borderRadius: 99 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: 'var(--grad-primary)', borderRadius: 99, transition: 'width .05s' }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', height: '100%' }}
        />
        <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 16, height: 16, borderRadius: '50%', background: 'var(--primary)', border: '2.5px solid #fff', boxShadow: '0 1px 6px rgba(0,0,0,0.3)', pointerEvents: 'none', transition: 'left .05s' }} />
      </div>
    </div>
  )
}

// ── Select Field ──────────────────────────────────────────────────
function SelectField({ label, value, options, onChange, desc }: {
  label: string; value: string; options: { label: string; value: string }[]; onChange: (v: string) => void; desc?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{desc}</div>}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 12, outline: 'none', cursor: 'pointer', maxWidth: 160 }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Seção com collapse ────────────────────────────────────────────
function Section({ icon: Icon, title, children, defaultOpen = true }: {
  icon: ElementType; title: string; children: ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: open ? 'var(--primary-dim)' : 'var(--bg3)', border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'background .15s' }}
      >
        <Icon size={16} color="var(--primary)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <ChevronRight size={14} color="var(--text3)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 8px', background: 'var(--bg2)', borderRadius: '0 0 10px 10px', border: '1px solid var(--border)', borderTop: 'none' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────
export default function DesignEditor() {
  const [tokens, setTokens] = useState<DesignTokens>(() => {
    const t = loadTokens()
    // Aplica tokens salvos ao carregar
    setTimeout(() => applyAllTokens(t), 0)
    return t
  })
  const [activeTab, setActiveTab] = useState<'cores' | 'tipografia' | 'layout' | 'presets' | 'codigo'>('presets')
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop')
  const [hasChanges, setHasChanges] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  // Aplica token e marca como modificado
  const set = useCallback(<K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => {
    setTokens(prev => ({ ...prev, [key]: value }))
    applyToken(key, value)
    setHasChanges(true)
  }, [])

  function handleSave() {
    saveTokens(tokens)
    setHasChanges(false)
    toast('✅ Tema salvo! Aplicado ao sistema.')
  }

  function handleReset() {
    const def = resetTokens()
    setTokens(def)
    setHasChanges(false)
    toast('↩️ Tema restaurado para o padrão.')
  }

  function handlePreset(preset: typeof PRESETS[0]) {
    const merged = { ...tokens, ...preset.tokens }
    setTokens(merged)
    applyAllTokens(preset.tokens)
    setHasChanges(true)
    toast(`${preset.emoji} Preset "${preset.name}" aplicado!`)
  }

  function handleExport() {
    const css = exportTokensAsCSS(tokens)
    const blob = new Blob([css], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'nexus-theme.css'
    a.click(); URL.revokeObjectURL(url)
    toast('📁 CSS exportado com sucesso!')
  }

  function handleCopyCSS() {
    navigator.clipboard.writeText(exportTokensAsCSS(tokens))
    toast('📋 CSS copiado para a área de transferência!')
  }

  // Parse de px para number
  function px(val: string) { return parseInt(val) || 0 }

  const tabs = [
    { id: 'presets',     label: 'Presets',     icon: Wand2 },
    { id: 'cores',       label: 'Cores',       icon: Palette },
    { id: 'tipografia',  label: 'Tipografia',  icon: Type },
    { id: 'layout',      label: 'Layout',      icon: Layout },
    { id: 'codigo',      label: 'Código',      icon: Code },
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Palette size={18} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 17, fontWeight: 500, color: 'var(--text)', lineHeight: 1 }}>Editor Visual</h1>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Edite o design do sistema em tempo real</p>
        </div>

        {/* Botões de ação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasChanges && (
            <div style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)' }} />
              Não salvo
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowInfo(i => !i)} style={{ padding: '6px 8px' }}>
            <Info size={15} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleReset} title="Restaurar padrão">
            <RotateCcw size={14} /> Restaurar
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} title="Salvar tema">
            <Check size={14} /> Salvar
          </button>
        </div>
      </div>

      {/* ── Info banner ── */}
      {showInfo && (
        <div style={{ padding: '12px 20px', background: 'rgba(91,124,250,0.08)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Info size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            Todas as alterações são aplicadas <strong>ao vivo</strong> no sistema. Abra outra aba com o sistema para ver o resultado em tempo real. Clique em <strong>Salvar</strong> para persistir. Use <strong>Exportar CSS</strong> para baixar o arquivo e substituir o <code>theme.css</code> no repositório para tornar permanente no código-fonte.
          </p>
        </div>
      )}

      {/* ── Layout principal ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Painel lateral de edição ── */}
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg2)' }}>

          {/* Tabs */}
          <div style={{ display: 'flex', padding: '8px 8px 0', gap: 2, background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
            {tabs.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', background: active ? 'var(--bg2)' : 'transparent', borderBottom: active ? `2px solid var(--primary)` : '2px solid transparent', transition: 'all .15s' }}>
                  <Icon size={15} color={active ? 'var(--primary)' : 'var(--text3)'} />
                  <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, color: active ? 'var(--primary)' : 'var(--text3)', whiteSpace: 'nowrap' }}>{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div style={{ padding: '12px 8px' }}>

            {/* ═══ PRESETS ═══ */}
            {activeTab === 'presets' && (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text3)', padding: '0 8px 12px', lineHeight: 1.6 }}>
                  Clique em um preset para aplicar instantaneamente. Você pode ajustar depois nas outras abas.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {PRESETS.map(preset => (
                    <button key={preset.name} onClick={() => handlePreset(preset)}
                      style={{ background: 'var(--bg3)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 10px', cursor: 'pointer', textAlign: 'center', transition: 'all .15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-dim)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}>
                      <div style={{ fontSize: 24 }}>{preset.emoji}</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['primary', 'secondary', 'success'].map(k => (
                          <div key={k} style={{ width: 12, height: 12, borderRadius: '50%', background: (preset.tokens as Record<string, string>)[k] || '#ccc' }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', lineHeight: 1.2 }}>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ CORES ═══ */}
            {activeTab === 'cores' && (
              <div>
                <Section icon={Palette} title="Cores da Marca">
                  <ColorField label="Primária" value={tokens.primary} onChange={v => set('primary', v)} desc="Botões, links, destaques" />
                  <ColorField label="Secundária" value={tokens.secondary} onChange={v => set('secondary', v)} desc="Acentos, badges info" />
                  <ColorField label="Sucesso" value={tokens.success} onChange={v => set('success', v)} desc="Confirmações, status OK" />
                  <ColorField label="Alerta" value={tokens.warning} onChange={v => set('warning', v)} desc="Avisos, atenção" />
                  <ColorField label="Perigo" value={tokens.danger} onChange={v => set('danger', v)} desc="Erros, exclusões" />
                </Section>
                <Section icon={Layers} title="Backgrounds">
                  <ColorField label="Fundo principal" value={tokens.bg} onChange={v => set('bg', v)} desc="Cor de fundo da página" />
                  <ColorField label="Superfície" value={tokens.bg2} onChange={v => set('bg2', v)} desc="Cards, sidebar, topbar" />
                  <ColorField label="Superfície suave" value={tokens.bg3} onChange={v => set('bg3', v)} desc="Inputs, tabs, hover" />
                  <ColorField label="Superfície forte" value={tokens.bg4} onChange={v => set('bg4', v)} desc="Bordas, divisores" />
                </Section>
                <Section icon={Type} title="Cores de Texto" defaultOpen={false}>
                  <ColorField label="Texto principal" value={tokens.text} onChange={v => set('text', v)} />
                  <ColorField label="Texto secundário" value={tokens.text2} onChange={v => set('text2', v)} />
                  <ColorField label="Texto suave" value={tokens.text3} onChange={v => set('text3', v)} />
                </Section>

                {/* Gradiente customizado */}
                <Section icon={Wand2} title="Gradiente Principal" defaultOpen={false}>
                  <div style={{ padding: '12px 0' }}>
                    <div style={{ height: 48, borderRadius: 12, background: tokens.gradPrimary, marginBottom: 12 }} />
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Gerar a partir das cores primária e secundária:</div>
                    <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => {
                      const grad = `linear-gradient(135deg,${tokens.primary} 0%,${tokens.secondary} 100%)`
                      set('gradPrimary', grad)
                    }}>
                      <Wand2 size={13} /> Gerar Gradiente
                    </button>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Ou cole um gradiente CSS:</div>
                      <input
                        style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
                        value={tokens.gradPrimary}
                        onChange={e => set('gradPrimary', e.target.value)}
                        placeholder="linear-gradient(135deg, #fff 0%, #000 100%)"
                      />
                    </div>
                  </div>
                </Section>
              </div>
            )}

            {/* ═══ TIPOGRAFIA ═══ */}
            {activeTab === 'tipografia' && (
              <div>
                <Section icon={Type} title="Fontes">
                  <SelectField label="Fonte do corpo" value={tokens.fontBody} onChange={v => set('fontBody', v)} options={FONTS} desc="Textos gerais" />
                  <SelectField label="Fonte de títulos" value={tokens.fontHeading} onChange={v => set('fontHeading', v)} options={FONTS} desc="H1, H2, botões" />
                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Prévia da fonte:</div>
                    <div style={{ fontFamily: tokens.fontBody, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
                      Lorem ipsum dolor sit amet consectetur.
                    </div>
                    <div style={{ fontFamily: tokens.fontHeading, fontSize: 20, fontWeight: 500, color: 'var(--text)', marginTop: 6 }}>
                      Título do Sistema
                    </div>
                  </div>
                </Section>

                <Section icon={Type} title="Tamanho das fontes">
                  <SliderField label="XS (micro)" value={px(tokens.textXs) || 12} unit="px" min={10} max={16} onChange={v => set('textXs', `${v}px`)} desc="Labels, badges" />
                  <SliderField label="SM (pequeno)" value={px(tokens.textSm) || 13} unit="px" min={11} max={18} onChange={v => set('textSm', `${v}px`)} desc="Subtextos" />
                  <SliderField label="Base (padrão)" value={px(tokens.textBase) || 14} unit="px" min={12} max={20} onChange={v => set('textBase', `${v}px`)} desc="Texto geral" />
                  <SliderField label="MD (médio)" value={px(tokens.textMd) || 16} unit="px" min={14} max={22} onChange={v => set('textMd', `${v}px`)} desc="Destaques" />
                  <SliderField label="LG (grande)" value={px(tokens.textLg) || 18} unit="px" min={16} max={28} onChange={v => set('textLg', `${v}px`)} desc="Subtítulos" />
                  <SliderField label="XL (título)" value={px(tokens.textXl) || 22} unit="px" min={18} max={36} onChange={v => set('textXl', `${v}px`)} desc="H2, H3" />
                  <SliderField label="2XL (destaque)" value={px(tokens.text2xl) || 28} unit="px" min={22} max={48} onChange={v => set('text2xl', `${v}px`)} desc="H1, hero" />
                </Section>

                <Section icon={Sliders} title="Pesos das fontes" defaultOpen={false}>
                  <SliderField label="Normal" value={Number(tokens.fwNormal)} unit="" min={300} max={500} step={100} onChange={v => set('fwNormal', String(v))} />
                  <SliderField label="Médio" value={Number(tokens.fwMedium)} unit="" min={400} max={600} step={100} onChange={v => set('fwMedium', String(v))} />
                  <SliderField label="Semibold" value={Number(tokens.fwSemibold)} unit="" min={500} max={700} step={100} onChange={v => set('fwSemibold', String(v))} />
                  <SliderField label="Bold" value={Number(tokens.fwBold)} unit="" min={500} max={800} step={100} onChange={v => set('fwBold', String(v))} />
                  <SliderField label="Black (mais forte)" value={Number(tokens.fwBlack)} unit="" min={600} max={900} step={100} onChange={v => set('fwBlack', String(v))} />
                </Section>
              </div>
            )}

            {/* ═══ LAYOUT ═══ */}
            {activeTab === 'layout' && (
              <div>
                <Section icon={Layout} title="Bordas arredondadas">
                  <SliderField label="XS (micro)" value={px(tokens.radiusXs)} unit="px" min={0} max={12} onChange={v => set('radiusXs', `${v}px`)} />
                  <SliderField label="SM (pequeno)" value={px(tokens.radiusSm)} unit="px" min={0} max={16} onChange={v => set('radiusSm', `${v}px`)} />
                  <SliderField label="Padrão" value={px(tokens.radius)} unit="px" min={0} max={24} onChange={v => set('radius', `${v}px`)} desc="Cards, botões" />
                  <SliderField label="LG (grande)" value={px(tokens.radiusLg)} unit="px" min={0} max={32} onChange={v => set('radiusLg', `${v}px`)} />
                  <SliderField label="XL (modais)" value={px(tokens.radiusXl)} unit="px" min={0} max={40} onChange={v => set('radiusXl', `${v}px`)} />
                  {/* Pré-visualização de raios */}
                  <div style={{ display: 'flex', gap: 8, padding: '12px 0', flexWrap: 'wrap' }}>
                    {[tokens.radiusXs, tokens.radiusSm, tokens.radius, tokens.radiusLg, tokens.radiusXl].map((r, i) => (
                      <div key={i} style={{ width: 40, height: 40, background: 'var(--primary-dim)', border: '2px solid var(--primary)', borderRadius: r, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>{r}</div>
                    ))}
                  </div>
                </Section>

                <Section icon={Monitor} title="Dimensões" defaultOpen={false}>
                  <SliderField label="Largura sidebar" value={px(tokens.sidebarW)} unit="px" min={180} max={320} onChange={v => set('sidebarW', `${v}px`)} />
                  <SliderField label="Altura topbar" value={px(tokens.topbarH)} unit="px" min={44} max={80} onChange={v => set('topbarH', `${v}px`)} />
                  <SliderField label="Altura nav. mobile" value={px(tokens.bottomNavH)} unit="px" min={48} max={80} onChange={v => set('bottomNavH', `${v}px`)} />
                  <SliderField label="Padding da página" value={px(tokens.pagePad)} unit="px" min={8} max={48} onChange={v => set('pagePad', `${v}px`)} />
                  <SliderField label="Padding dos cards" value={px(tokens.cardPad)} unit="px" min={8} max={40} onChange={v => set('cardPad', `${v}px`)} />
                </Section>

                <Section icon={Layers} title="Sombras" defaultOpen={false}>
                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Presets de sombra:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: 'Flat (sem sombra)', sm: 'none', md: 'none', lg: 'none' },
                        { label: 'Suave', sm: '0 1px 4px rgba(0,0,0,0.06)', md: '0 2px 8px rgba(0,0,0,0.08)', lg: '0 4px 16px rgba(0,0,0,0.10)' },
                        { label: 'Médio (padrão)', sm: '0 1px 6px rgba(0,0,0,0.08)', md: '0 4px 16px rgba(0,0,0,0.10)', lg: '0 8px 32px rgba(0,0,0,0.12)' },
                        { label: 'Profundo', sm: '0 2px 8px rgba(0,0,0,0.15)', md: '0 6px 24px rgba(0,0,0,0.20)', lg: '0 12px 40px rgba(0,0,0,0.25)' },
                        { label: 'Dramático', sm: '0 4px 12px rgba(0,0,0,0.20)', md: '0 10px 32px rgba(0,0,0,0.30)', lg: '0 20px 60px rgba(0,0,0,0.40)' },
                      ].map(preset => (
                        <button key={preset.label} onClick={() => { set('shadowSm', preset.sm); set('shadowMd', preset.md); set('shadowLg', preset.lg) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', transition: 'all .15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-dim)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg2)', boxShadow: preset.md }} />
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </Section>

                <Section icon={Sliders} title="Transições" defaultOpen={false}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0' }}>
                    {[
                      { label: 'Instantâneo', fast: '0.05s ease', base: '0.08s ease', slow: '0.15s ease' },
                      { label: 'Rápido (padrão)', fast: '0.12s ease', base: '0.2s ease', slow: '0.35s ease' },
                      { label: 'Médio', fast: '0.2s ease', base: '0.35s ease', slow: '0.5s ease' },
                      { label: 'Fluido', fast: '0.25s cubic-bezier(.34,1.56,.64,1)', base: '0.4s cubic-bezier(.34,1.56,.64,1)', slow: '0.6s ease' },
                      { label: 'Sem animação', fast: '0s', base: '0s', slow: '0s' },
                    ].map(p => (
                      <button key={p.label} onClick={() => { set('transitionFast', p.fast); set('transitionBase', p.base); set('transitionSlow', p.slow) }}
                        style={{ padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text)', textAlign: 'left', transition: 'background .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-dim)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg3)' }}>
                        {p.label} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({p.base})</span>
                      </button>
                    ))}
                  </div>
                </Section>
              </div>
            )}

            {/* ═══ CÓDIGO ═══ */}
            {activeTab === 'codigo' && (
              <div style={{ padding: '8px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.7, padding: '0 4px' }}>
                  Exporte o CSS gerado e substitua o arquivo <code style={{ background: 'var(--bg4)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>src/styles/theme.css</code> no seu repositório para tornar as mudanças permanentes no código.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <button className="btn btn-primary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Download size={15} /> Baixar theme.css
                  </button>
                  <button className="btn btn-ghost" onClick={handleCopyCSS} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Copy size={15} /> Copiar CSS
                  </button>
                </div>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, maxHeight: 400, overflowY: 'auto' }}>
                  <pre style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {exportTokensAsCSS(tokens)}
                  </pre>
                </div>
                <div style={{ marginTop: 16, padding: '12px', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>⚠️ Para mudança permanente no código:</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
                    1. Baixe o arquivo <strong>theme.css</strong><br />
                    2. Substitua <code>src/styles/theme.css</code> no GitHub<br />
                    3. O sistema fará rebuild automaticamente
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Área de preview ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg3)' }}>

          {/* Toolbar de preview */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eye size={15} color="var(--text3)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Preview ao vivo</span>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3 }}>
              <button onClick={() => setPreview('desktop')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: preview === 'desktop' ? 'var(--bg2)' : 'transparent', color: preview === 'desktop' ? 'var(--primary)' : 'var(--text3)', fontSize: 12, fontWeight: 600, boxShadow: preview === 'desktop' ? 'var(--shadow-sm)' : 'none' }}>
                <Monitor size={13} /> Desktop
              </button>
              <button onClick={() => setPreview('mobile')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: preview === 'mobile' ? 'var(--bg2)' : 'transparent', color: preview === 'mobile' ? 'var(--primary)' : 'var(--text3)', fontSize: 12, fontWeight: 600, boxShadow: preview === 'mobile' ? 'var(--shadow-sm)' : 'none' }}>
                <Smartphone size={13} /> Mobile
              </button>
            </div>
          </div>

          {/* Preview iframe vivo */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
            <div style={{
              width: preview === 'mobile' ? 375 : '100%',
              maxWidth: preview === 'mobile' ? 375 : 1100,
              height: preview === 'mobile' ? 720 : '100%',
              borderRadius: preview === 'mobile' ? 32 : 16,
              overflow: 'hidden',
              boxShadow: '0 8px 48px rgba(0,0,0,0.2)',
              border: preview === 'mobile' ? '8px solid #1a1a1a' : '1px solid var(--border2)',
              background: 'var(--bg2)',
              flexShrink: 0,
            }}>
              {/* Mini preview do sistema com os tokens aplicados */}
              <PreviewContent tokens={tokens} mobile={preview === 'mobile'} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Preview Component — simula o sistema real ─────────────────────
function PreviewContent({ tokens, mobile }: { tokens: DesignTokens; mobile: boolean }) {
  const [activePage, setActivePage] = useState<'dashboard' | 'tarefas' | 'usuarios'>('dashboard')

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'tarefas', label: 'Tarefas', icon: '✅' },
    { id: 'usuarios', label: 'Usuários', icon: '👥' },
  ] as const

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: tokens.fontBody, background: tokens.bg, color: tokens.text, fontSize: tokens.textBase }}>
      {/* Topbar */}
      <div style={{ height: tokens.topbarH, background: tokens.bg2, borderBottom: `1px solid ${tokens.border2}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: tokens.radiusSm, background: tokens.gradPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚡</div>
        <span style={{ fontFamily: tokens.fontHeading, fontWeight: 600, fontSize: tokens.textLg, background: tokens.gradPrimary, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Nexus</span>
        <div style={{ flex: 1 }} />
        <div style={{ width: 28, height: 28, borderRadius: tokens.radius, background: tokens.gradPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', fontWeight: 600 }}>VM</div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Sidebar (só desktop) */}
        {!mobile && (
          <div style={{ width: tokens.sidebarW, background: tokens.bg2, borderRight: `1px solid ${tokens.border}`, padding: '12px 8px', flexShrink: 0 }}>
            {nav.map(n => (
              <div key={n.id} onClick={() => setActivePage(n.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 2, borderRadius: tokens.radiusSm, cursor: 'pointer', background: activePage === n.id ? `${tokens.primary}20` : 'transparent', color: activePage === n.id ? tokens.primary : tokens.text3, fontWeight: activePage === n.id ? 700 : 500, fontSize: tokens.textSm, transition: tokens.transitionBase }}>
                {n.icon} {n.label}
              </div>
            ))}
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto', padding: tokens.pagePad }}>
          {activePage === 'dashboard' && (
            <div>
              <h1 style={{ fontFamily: tokens.fontHeading, fontSize: tokens.text2xl, fontWeight: 600, marginBottom: 4 }}>Dashboard</h1>
              <p style={{ color: tokens.text3, fontSize: tokens.textSm, marginBottom: 20 }}>Visão geral do sistema</p>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                {[{ label: 'Tarefas', val: '24', icon: '✅', color: tokens.success }, { label: 'Membros', val: '8', icon: '👥', color: tokens.primary }, { label: 'Receita', val: 'R$12k', icon: '💰', color: tokens.warning }, { label: 'Alertas', val: '3', icon: '🔔', color: tokens.danger }].map(m => (
                  <div key={m.label} style={{ background: tokens.bg2, border: `1px solid ${tokens.border}`, borderRadius: tokens.radius, padding: tokens.cardPad, boxShadow: tokens.shadowSm }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
                    <div style={{ fontFamily: tokens.fontHeading, fontSize: tokens.textXl, fontWeight: 600, color: m.color }}>{m.val}</div>
                    <div style={{ fontSize: tokens.textXs, color: tokens.text3, fontWeight: 600 }}>{m.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: tokens.bg2, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusLg, padding: tokens.cardPad, boxShadow: tokens.shadowSm }}>
                <div style={{ fontFamily: tokens.fontHeading, fontWeight: 600, fontSize: tokens.textMd, marginBottom: 12 }}>Tarefas Recentes</div>
                {['Revisar contrato de vendas', 'Reunião com equipe de TI', 'Atualizar relatório mensal'].map((t, i) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 2 ? `1px solid ${tokens.border}` : 'none' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: [tokens.success, tokens.warning, tokens.primary][i] }} />
                    <span style={{ flex: 1, fontSize: tokens.textSm }}>{t}</span>
                    <span style={{ fontSize: tokens.textXs, color: tokens.text3, background: `${tokens.primary}15`, padding: '2px 8px', borderRadius: tokens.radiusXs }}>Hoje</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activePage === 'tarefas' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontFamily: tokens.fontHeading, fontSize: tokens.text2xl, fontWeight: 600 }}>Tarefas</h1>
                <button style={{ background: tokens.gradPrimary, color: '#fff', border: 'none', borderRadius: tokens.radius, padding: '8px 16px', fontSize: tokens.textSm, fontWeight: 600, cursor: 'pointer' }}>+ Nova</button>
              </div>
              {['Pendente', 'Em progresso', 'Concluída'].map((status, si) => (
                <div key={status} style={{ background: tokens.bg2, border: `1px solid ${tokens.border}`, borderRadius: tokens.radius, padding: tokens.cardPad, marginBottom: 12, boxShadow: tokens.shadowSm }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: tokens.textSm }}>{status}</span>
                    <span style={{ fontSize: tokens.textXs, color: '#fff', background: [tokens.warning, tokens.primary, tokens.success][si], padding: '2px 8px', borderRadius: tokens.radiusXs }}>{[3, 2, 5][si]}</span>
                  </div>
                  <div style={{ height: 4, background: tokens.bg4, borderRadius: 99 }}>
                    <div style={{ height: '100%', width: ['30%', '55%', '100%'][si], background: tokens.gradPrimary, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {activePage === 'usuarios' && (
            <div>
              <h1 style={{ fontFamily: tokens.fontHeading, fontSize: tokens.text2xl, fontWeight: 600, marginBottom: 20 }}>Usuários</h1>
              {['Ana Silva — Gestora', 'Carlos Souza — Membro', 'Maria Santos — Sub-Gestora'].map((u, i) => (
                <div key={u} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: tokens.cardPad, background: tokens.bg2, border: `1px solid ${tokens.border}`, borderRadius: tokens.radius, marginBottom: 8, boxShadow: tokens.shadowSm }}>
                  <div style={{ width: 36, height: 36, borderRadius: tokens.radiusSm, background: tokens.gradPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff', fontWeight: 600, flexShrink: 0 }}>{u[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: tokens.textSm }}>{u.split('—')[0]}</div>
                    <span style={{ fontSize: tokens.textXs, color: [tokens.primary, tokens.text3, tokens.secondary][i], background: [`${tokens.primary}15`, `${tokens.text3}15`, `${tokens.secondary}15`][i], padding: '1px 6px', borderRadius: tokens.radiusXs, fontWeight: 600 }}>{u.split('—')[1]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav (mobile) */}
      {mobile && (
        <div style={{ height: tokens.bottomNavH, background: tokens.bg2, borderTop: `1px solid ${tokens.border}`, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {nav.map(n => (
            <button key={n.id} onClick={() => setActivePage(n.id)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 4px', background: 'none', border: 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: activePage === n.id ? tokens.primary : tokens.text3 }}>{n.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
