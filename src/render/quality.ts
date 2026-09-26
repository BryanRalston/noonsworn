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
  const mali = /mali-g(\d{2,4})/i.exec(raw)
  if (mali) return Number(mali[1]) >= 610 ? 'med' : 'low'
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

const VSYNC_MS = [1000 / 144, 1000 / 120, 1000 / 90, 1000 / 60]

export function snapVsync(ms: number): number {
  let best = 1000 / 60
  let bestD = Infinity
  for (let i = 0; i < VSYNC_MS.length; i++) {
    const v = VSYNC_MS[i] ?? best
    const d = Math.abs(ms - v)
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  return Math.min(best, 16.7)
}

export function tierMaxRatio(tier: TierName, dpr: number, mobile = false): number {
  const spec = TUNING.tiers[tier]
  let cap = Math.min(spec.maxRatio, dpr)
  if (mobile && tier === 'med') cap = Math.min(cap, 1.5)
  return Math.max(spec.minRatio, cap)
}

function clampRatio(tier: TierName, ratio: number, dpr: number, mobile: boolean): number {
  const min = TUNING.tiers[tier].minRatio
  const max = tierMaxRatio(tier, dpr, mobile)
  return Math.round(Math.min(max, Math.max(min, ratio)) * 100) / 100
}

function drop(tier: TierName): TierName {
  const i = ORDER.indexOf(tier)
  return ORDER[Math.max(0, i - 1)] ?? 'low'
}

function raise(tier: TierName): TierName {
  const i = ORDER.indexOf(tier)
  return ORDER[Math.min(ORDER.length - 1, i + 1)] ?? 'high'
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
      const parsed = JSON.parse(raw) as { renderer?: string; tier?: TierName; version?: string }
      if (parsed.version === __VERSION__ && parsed.renderer === renderer && (parsed.tier === 'low' || parsed.tier === 'med' || parsed.tier === 'high')) {
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
  let ratio = clampRatio(tier, tierMaxRatio(tier, dpr, mobile), dpr, mobile)
  const dynres = createDynres(ratio)
  const bench: number[] = []
  const vsync: number[] = []
  let benchT = 0
  let vsyncReady = false
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
      if (!mobile && !vsyncReady && frameMs > 0 && frameMs <= TUNING.quality.ignoreFrameMs) {
        vsync.push(frameMs)
        if (vsync.length >= 60) {
          const sorted = vsync.slice().sort((a, b) => a - b)
          api.targetMs = snapVsync(sorted[30] ?? TUNING.quality.desktopTarget)
          vsyncReady = true
        }
      }
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
            else if (median < api.targetMs * TUNING.quality.benchRaise) {
              const next = raise(api.tier)
              if (!(api.mobile && next === 'high' && median >= api.targetMs * TUNING.quality.benchPhone)) api.tier = next
            } else if (api.tier === 'low') api.tier = 'med'
            if (api.mobile && api.tier === 'high' && median >= api.targetMs * TUNING.quality.benchPhone) api.tier = 'med'
          }
          setRatio(tierMaxRatio(api.tier, Math.max(1, window.devicePixelRatio || 1), api.mobile))
          storageSet(TUNING.quality.storageKey, JSON.stringify({ renderer: api.renderer, tier: api.tier, version: __VERSION__ }))
          api.onChange?.()
        }
        return
      }
      if (!playing || !api.dynres.enabled) return
      const nowDpr = Math.max(1, window.devicePixelRatio || 1)
      const result = api.dynres.sample(frameMs, frameSec, api.targetMs, TUNING.tiers[api.tier].minRatio, tierMaxRatio(api.tier, nowDpr, api.mobile))
      if (result.changed) {
        api.ratio = api.dynres.ratio
        api.onChange?.()
      }
      if (result.dropTier && api.autoDrop && api.tier !== 'low') {
        api.tier = drop(api.tier)
        setRatio(TUNING.tiers[api.tier].minRatio)
        api.onChange?.()
      }
    },
    forceTier(next) {
      api.tier = next
      api.autoDrop = false
      api.benchmarking = false
      setRatio(tierMaxRatio(next, Math.max(1, window.devicePixelRatio || 1), api.mobile))
      api.onChange?.()
    },
    setDynresEnabled(on) {
      api.dynres.enabled = on
    },
  }
  function setRatio(next: number) {
    api.ratio = clampRatio(api.tier, next, Math.max(1, window.devicePixelRatio || 1), api.mobile)
    api.dynres.setRatio(api.ratio)
  }
  return api
}
