import { TUNING, type TierName } from '../data/tuning'
import { storageGet, storageSet } from '../platform/storage'
import { createDynres, type Dynres } from './dynres'

const ORDER: TierName[] = ['low', 'med', 'high']

export function detectMobile(): boolean {
  const ua = navigator.userAgent
  if (/Android|iPhone|iPad|iPod|Mobi/i.test(ua)) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  return coarse && noHover && navigator.maxTouchPoints > 0
}

export function probeRendererString(): string {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance', antialias: false, alpha: false })
  if (!gl) return ''
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  if (!ext) return ''
  const value = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
  return typeof value === 'string' ? value : ''
}

export function tierFromRenderer(renderer: string, mobile: boolean): TierName {
  const raw = renderer.trim()
  if (!raw) return 'med'
  const lower = raw.toLowerCase()
  if (lower === 'webkit webgl' || lower === 'webgl') return 'med'
  if (/mali-g[567]/i.test(raw)) return 'low'
  if (/powervr|swiftshader|llvmpipe/i.test(raw)) return 'low'
  if (/uhd graphics|hd graphics|intel\(r\) hd|intel\(r\) uhd/i.test(raw)) return 'low'
  const adreno = /adreno(?:\D)*(\d{3,4})/i.exec(raw)
  if (adreno) {
    const model = Number(adreno[1])
    return Number.isFinite(model) && model <= 640 ? 'low' : 'med'
  }
  const high = /nvidia|geforce|quadro|\brtx\b|\bgtx\b|radeon\s+rx|radeon\s+pro|apple\s+m\d/i.test(raw)
  if (high) return mobile ? 'med' : 'high'
  if (/iris\s*xe|intel\(r\) iris|apple gpu|apple a\d+/i.test(raw)) return 'med'
  return 'med'
}

export function tierMaxRatio(tier: TierName, dpr: number): number {
  const spec = TUNING.tiers[tier]
  const cap = tier === 'high' ? Math.min(spec.maxRatio, dpr) : spec.maxRatio
  return Math.max(spec.minRatio, cap)
}

function clampRatio(tier: TierName, ratio: number, dpr: number): number {
  const min = TUNING.tiers[tier].minRatio
  const max = tierMaxRatio(tier, dpr)
  return Math.round(Math.min(max, Math.max(min, ratio)) * 100) / 100
}

function drop(tier: TierName): TierName {
  const i = ORDER.indexOf(tier)
  return ORDER[Math.max(0, i - 1)] ?? 'low'
}

function parseTier(value: string | null): TierName | null {
  if (value === 'low' || value === 'med' || value === 'high') return value
  return null
}

export interface QualityController {
  tier: TierName
  ratio: number
  mobile: boolean
  renderer: string
  autoDrop: boolean
  benchmarking: boolean
  targetMs: number
  dynres: Dynres
  cap: number
  sample: (frameMs: number, frameSec: number, playing: boolean) => void
  forceTier: (tier: TierName) => void
  setDynresEnabled: (on: boolean) => void
  onChange: (() => void) | null
}

export function wantsAntialias(tier: TierName, mobile: boolean): boolean {
  return tier === 'high' && !mobile
}

export function createQuality(): QualityController {
  const mobile = detectMobile()
  const renderer = probeRendererString()
  const params = new URLSearchParams(location.search)
  const forcedTier = parseTier(params.get('tier'))
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  let saved: TierName | null = null
  const raw = storageGet(TUNING.quality.storageKey)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { renderer?: string; tier?: TierName }
      if (parsed.renderer === renderer && (parsed.tier === 'low' || parsed.tier === 'med' || parsed.tier === 'high')) {
        saved = parsed.tier
      }
    } catch {
      saved = null
    }
  }
  let tier: TierName = 'med'
  let benchmarking = false
  let autoDrop = true
  if (forcedTier) {
    tier = forcedTier
    autoDrop = false
  } else if (saved) {
    tier = mobile && saved === 'high' ? 'med' : saved
  } else {
    tier = tierFromRenderer(renderer, mobile)
    if (mobile && tier === 'high') tier = 'med'
    benchmarking = true
  }
  const targetMs = mobile ? TUNING.quality.mobileTarget : TUNING.quality.desktopTarget
  let ratio = clampRatio(tier, tierMaxRatio(tier, dpr), dpr)
  const dynres = createDynres(ratio)
  const bench: number[] = []
  let benchT = 0
  const api: QualityController = {
    tier,
    ratio,
    mobile,
    renderer,
    autoDrop,
    benchmarking,
    targetMs,
    dynres,
    get cap() {
      return TUNING.tiers[api.tier].cap
    },
    onChange: null,
    sample(frameMs, frameSec, playing) {
      if (api.benchmarking) {
        benchT += frameSec
        if (benchT >= TUNING.quality.benchWarmup && frameMs > 0 && frameMs <= TUNING.quality.ignoreFrameMs) bench.push(frameMs)
        if (benchT >= TUNING.quality.benchSeconds) {
          api.benchmarking = false
          if (bench.length >= 8) {
            const sorted = bench.slice().sort((a, b) => a - b)
            const mid = (sorted.length / 2) | 0
            const median = sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0)
            if (median > api.targetMs * TUNING.quality.benchDrop) api.tier = drop(api.tier)
            else if (!api.mobile && api.tier === 'med' && median < api.targetMs * TUNING.quality.benchRaise) api.tier = 'high'
          }
          setRatio(tierMaxRatio(api.tier, Math.max(1, window.devicePixelRatio || 1)))
          storageSet(TUNING.quality.storageKey, JSON.stringify({ renderer: api.renderer, tier: api.tier }))
          api.onChange?.()
        }
        return
      }
      if (!playing || !api.dynres.enabled) return
      const nowDpr = Math.max(1, window.devicePixelRatio || 1)
      const result = api.dynres.sample(frameMs, frameSec, api.targetMs, TUNING.tiers[api.tier].minRatio, tierMaxRatio(api.tier, nowDpr))
      if (result.changed) {
        api.ratio = api.dynres.ratio
        api.onChange?.()
      }
      if (result.dropTier && api.autoDrop && api.tier !== 'low') {
        api.tier = drop(api.tier)
        setRatio(TUNING.tiers[api.tier].minRatio)
        storageSet(TUNING.quality.storageKey, JSON.stringify({ renderer: api.renderer, tier: api.tier }))
        api.onChange?.()
      }
    },
    forceTier(next) {
      api.tier = next
      api.autoDrop = false
      api.benchmarking = false
      setRatio(tierMaxRatio(next, Math.max(1, window.devicePixelRatio || 1)))
      api.onChange?.()
    },
    setDynresEnabled(on) {
      api.dynres.enabled = on
    },
  }
  function setRatio(next: number) {
    api.ratio = clampRatio(api.tier, next, Math.max(1, window.devicePixelRatio || 1))
    api.dynres.setRatio(api.ratio)
  }
  return api
}
