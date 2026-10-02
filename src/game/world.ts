import {
  BackSide,
  BufferAttribute,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mountPalette, COLOR } from '../data/palette'
import { TUNING, type TierName } from '../data/tuning'
import { createEvents } from '../core/events'
import { startLoop, type LoopHost } from '../core/loop'
import { yawFromDirection } from '../core/math'
import { mulberry32, type Rng } from '../core/rng'
import { NoopAds } from '../platform/ads'
import { createFollowCamera } from '../render/camera'
import { createFloorMaterial, createWingFloorMaterial } from '../render/floorShader'
import { enemyTime, setEnemyLegSwing } from '../render/instancing'
import { createQuality, wantsAntialias } from '../render/quality'
import { createGpu } from '../render/renderer'
import { createInput, type InputState } from '../input/input'
import type { Basis } from '../input/touch'
import { createDebugOverlay, frameSummary, pushFrameSample } from '../ui/debugOverlay'
import { createFeatureMap } from '../ui/featureMap'
import { createHud } from '../ui/hud'
import { createLevelUp } from '../ui/levelUp'
import { autopickEnabled, createScreens, tipsEnabled, type ScreenMode } from '../ui/screens'
import { createTips } from '../ui/tips'
import { createTutorial } from '../ui/tutorial'
import { createSundial } from '../ui/sundialHud'
import { createFloats } from '../ui/floats'
import { createAudio } from '../audio/audio'
import { loadArt } from '../render/art'
import { createBloom } from '../render/bloom'
import { toonMap } from '../render/toon'
import { loadMaps, markSeen, noteRun, rememberMap } from '../data/maps'
import { storageGet, storageSet } from '../platform/storage'
import { createMapSelect } from '../ui/mapSelect'
import { createTouchControls } from '../ui/touchControls'
import { createSela } from './actors'
import { loadCast } from './charpack'
import { buildInlay, buildPillars, buildShell, buildWingFloors, createScatter, createSunPip } from './arena'
import { createShards } from './shards'
import { createBlobShadows } from './shadows'
import { createDirector, latticePlan } from './director'
import { createHorde, type HordeCtx } from './enemies/horde'
import { CARD, cardStep, createBuild, describe, grantXp, isSunBoon, noteJump, recommendIndex, rollCards, xpToNext, type Build, type Card } from './leveling'
import { createCut, resetCut, sweepCut, updateCut } from './noonCut'
import { createPickups } from './pickups'
import { createPlayer, hurtPlayer, integratePlayer, resetPlayer } from './player'
import { createSunClock, damageAmount } from './sunClock'
import { cellBlocked, resetHomePillars, setBeds } from './collision'
import type { CloisterHandle } from './cloister'
import type { LatticeHandle } from './lattice'
import { createTemple, writeFloorPillars } from './temple'
import { createTraps } from './traps'
import { createHalo } from './weapons/halo'
import { createSunspear } from './weapons/sunspear'
import { FX, createWeaponFx } from './weapons/fx'

function paintCaster(geo: CylinderGeometry) {
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const tmp = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const radial = Math.hypot(x, z)
    const onTop = y > 2.15
    if (onTop && radial > 0.78) tmp.copy(COLOR.gold)
    else if (onTop) tmp.copy(COLOR.sandstone).lerp(COLOR.linen, 0.35)
    else tmp.copy(COLOR.bronze).lerp(COLOR.sandstone, 0.35 + 0.5 * ((y + 2.5) / 5))
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
}

function blankInput(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: null,
    aimZ: null,
    cutPressed: false,
    cutDirX: null,
    cutDirZ: null,
    pausePressed: false,
    restartPressed: false,
    debugToggle: false,
    featureToggle: false,
    pick: -1,
    mouseIdle: true,
    usingTouch: false,
    claimPressed: false,
    confirmPressed: false,
    cancelPressed: false,
    navX: 0,
    navY: 0,
    anyPressed: false,
    keyPressed: false,
    shiftPressed: false,
    altPressed: false,
    miragePressed: false,
  }
}

export async function boot(container: HTMLElement) {
  mountPalette(document.documentElement)
  const params = new URLSearchParams(location.search)
  const previewWeapon = import.meta.env.DEV ? params.get('m25a') : null
  const previewRank = Number(params.get('rank') ?? '1')
  const previewTier = params.get('tier')
  const previewHold = params.get('hold') === '1'
  const previewShow = import.meta.env.DEV && params.get('show') === '1'
  const turnWho = import.meta.env.DEV ? params.get('turn') : null
  let previewCutIn = 0.4
  let showIn = 0.08
  let showX = 0
  let showZ = 0
  let previewFires = 0
  const flareRadius = (level: number) => (level <= 1 ? 7.5 * 0.6 : 3.5 + (level - 1))
  let cutMark = -1
  let teleGate = 0
  let hitPreview = 0.2
  let animHurt = false
  let animThrust = false
  let animThrow = false
  let animFlourish = false
  let animSlashSeen = 0
  let slashStopAt = -10
  const spearPoint = new Vector3()
  let litAx = 10.2
  let litAz = 1.4
  let shadeAx = 18
  let shadeAz = 3
  const forced = params.get('seed')
  const forcedSeed = forced != null && Number.isFinite(Number(forced)) ? Number(forced) : null
  let queuedSeed: number | null = null
  const ads = new NoopAds(params.get('ads') === 'fake')
  void ads.init()
  if (params.get('ads') === 'fake') {
    document.documentElement.dataset.ads = 'pending'
    void ads.showRewarded('revive').then((result) => {
      document.documentElement.dataset.ads = result
    })
  } else {
    document.documentElement.dataset.ads = 'noop'
  }
  const quality = createQuality()
  const savedPref = storageGet('noonsworn.quality.pref')
  if (!params.get('tier') && (savedPref === 'low' || savedPref === 'med' || savedPref === 'high')) quality.forceTier(savedPref)
  const canvas = document.createElement('canvas')
  canvas.id = 'game'
  container.append(canvas)
  const follow = createFollowCamera()
  let gpu: ReturnType<typeof createGpu>
  try {
    gpu = createGpu(canvas, follow.camera, wantsAntialias(quality.tier, quality.mobile))
  } catch {
    container.replaceChildren()
    const msg = document.createElement('p')
    msg.textContent = 'WebGL2 is required to play NOONSWORN.'
    msg.style.cssText = 'color:#FBF6EC;font-family:system-ui,sans-serif;padding:24px'
    container.append(msg)
    return
  }

  const ui = document.createElement('div')
  ui.id = 'ui'
  container.append(ui)
  const screens = createScreens(ui)
  const hud = createHud(ui)
  const sundial = createSundial(ui)
  const levelUp = createLevelUp(ui)
  const tips = createTips(ui)
  tips.setEnabled(tipsEnabled())
  const featureMap = createFeatureMap(() => ({ version: __VERSION__, sha: __SHA__, tier: quality.tier }))
  ui.append(featureMap.root)
  const gateArrow = document.createElement('div')
  gateArrow.id = 'gate-arrow'
  gateArrow.hidden = true
  ui.append(gateArrow)
  const arrowPoint = new Vector3()
  const debug = createDebugOverlay(ui)
  const touchView = createTouchControls(container)
  const basis: Basis = { fx: 0, fz: -1, rx: 1, rz: 0 }
  const input = createInput(canvas, touchView, () => basis)
  const floor = createFloorMaterial()
  const floorMesh = new Mesh(new PlaneGeometry(TUNING.arena.size, TUNING.arena.size).rotateX(-Math.PI / 2), floor.material)
  floorMesh.position.y = 0
  const wallMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true })
  const pillarMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true })
  const scatterMat = new MeshToonMaterial({ color: COLOR.sandstoneDeep, gradientMap: toonMap() })
  const outerMat = new MeshToonMaterial({ color: COLOR.sandstoneMid, gradientMap: toonMap() })
  outerMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDune;')
      .replace('#include <project_vertex>', 'vDune = (modelMatrix * vec4(transformed, 1.0)).xz;\n#include <project_vertex>')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vDune;
float duneHash(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794));
  p += dot(p, p.yx + 19.19);
  return fract(p.x * p.y);
}
float duneNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = duneHash(i);
  float b = duneHash(i + vec2(1.0, 0.0));
  float c = duneHash(i + vec2(0.0, 1.0));
  float d = duneHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float n12 = duneNoise(vDune / 12.0);
float n40 = duneNoise(vDune / 40.0);
float n3 = duneNoise(vDune / 3.0);
float n1 = duneNoise(vDune / 1.2);
float dune = n12 * 0.20 + n40 * 0.10 + n3 * 0.35 + n1 * 0.35;
float wall = 25.0;
float band = smoothstep(wall - 1.0, wall + 2.0, length(vDune)) * (1.0 - smoothstep(wall + 5.0, wall + 12.0, length(vDune)));
vec3 duneLo = vec3(0.38, 0.24, 0.12);
vec3 duneHi = vec3(0.95, 0.72, 0.42);
diffuseColor.rgb *= mix(duneLo, duneHi, dune);
float ripNear = abs(fract(vDune.x * 0.55 + vDune.y * 0.31) - 0.5);
float ripFar = abs(fract(vDune.x * 0.16 + vDune.y * 0.09) - 0.5);
diffuseColor.rgb *= mix(0.68, 1.28, ripNear * 0.62 + ripFar * 0.38);
diffuseColor.rgb *= mix(1.0, 0.55, band);`,
      )
  }
  const skyMat = new MeshBasicMaterial({ color: 0xffffff, side: BackSide, depthWrite: false, fog: false })
  const inlayMat = new MeshBasicMaterial({
    color: COLOR.sandstone,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const shell = new Mesh(buildShell(), wallMat)
  const pillars = new Mesh(buildPillars(), pillarMat)
  const wingFloor = new Mesh(buildWingFloors(), createWingFloorMaterial(floor.uniforms))
  wingFloor.frustumCulled = false
  wingFloor.visible = false
  const casterGeo = new CylinderGeometry(1, 1, 5, 8)
  paintCaster(casterGeo)
  const casterMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true })
  const wingPillars = new InstancedMesh(casterGeo, casterMat, 7)
  wingPillars.count = 0
  wingPillars.visible = false
  wingPillars.frustumCulled = false
  const temple = createTemple()
  const traps = createTraps()
  const inlay = new Mesh(buildInlay(), inlayMat)
  inlay.renderOrder = 1
  const outer = new Mesh(new PlaneGeometry(900, 900).rotateX(-Math.PI / 2), outerMat)
  outer.position.y = -0.05
  const skyHeight = 140
  const skyHorizonV = 0.36
  const skyCapGeo = new SphereGeometry(110, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45)
  skyCapGeo.translate(0, skyHeight * 0.5 - 8, 0)
  const skyTube = new CylinderGeometry(110, 110, skyHeight, 24, 1, true)
  const skyGeo = mergeGeometries([skyTube.index ? skyTube.toNonIndexed() : skyTube, skyCapGeo.index ? skyCapGeo.toNonIndexed() : skyCapGeo], false)
  if (!skyGeo) throw new Error('sky merge failed')
  const sky = new Mesh(skyGeo, skyMat)
  sky.renderOrder = -2
  const scatter = createScatter(scatterMat)
  const sunPip = createSunPip()
  const fx = createWeaponFx()
  let cast: Awaited<ReturnType<typeof loadCast>>
  try {
    cast = await loadCast()
  } catch (err) {
    if (import.meta.env.DEV) console.error(err)
    container.replaceChildren()
    const msg = document.createElement('p')
    msg.textContent = 'Character assets failed to load.'
    msg.style.cssText = 'color:#FBF6EC;font-family:system-ui,sans-serif;padding:24px'
    container.append(msg)
    return
  }
  const sela = createSela(cast.gltf)
  const playerView = sela.root
  const shadows = createBlobShadows()
  const shards = createShards()
  const bloom = createBloom()
  gpu.scene.add(sky, outer, scatter, floorMesh, wingFloor, shell, pillars, wingPillars, inlay, shadows.mesh, playerView, shards.mesh, fx.mesh, fx.hot)
  temple.attach(shell, wingFloor, wingPillars, gpu.scene, wallMat)
  traps.attach(gpu.scene)
  const tutorial = createTutorial(ui, gpu.scene)

  const sun = createSunClock()
  const horde = createHorde(cast.mite, cast.hound)
  const spears = createSunspear(fx)
  const halo = createHalo(fx)
  const pickups = createPickups()
  const director = createDirector()
  gpu.scene.add(horde.miteMesh, horde.houndMesh, horde.darterMesh, spears.mesh, halo.mesh, pickups.mesh)

  const bus = createEvents()
  const player = createPlayer()
  const cut = createCut()
  let build: Build = createBuild()
  let rng: Rng = mulberry32(forcedSeed ?? (Date.now() >>> 0))
  let mode: ScreenMode = 'splash'
  let activeMap: 'sundial' | 'lattice' | 'cloister' = 'sundial'
  let wantMap: 'sundial' | 'lattice' | 'cloister' = 'sundial'
  let lattice: LatticeHandle | null = null
  let latticeGate: Promise<void> | null = null
  let latticePending = false
  let cloister: CloisterHandle | null = null
  let cloisterGate: Promise<void> | null = null
  let cloisterPending = false
  let hintBits = Number(storageGet('noonsworn.cloister.hints') ?? '0') || 0
  let prevStep = 0
  let endAt = 0
  let xpWindow = 0
  let xpWindowT = 0
  let xpPerSec = 0
  let time = 0
  let kills = 0
  let tick = 0
  let hitStop = 0
  let shakeT = 0
  let shakeAmp = 0
  let swallow = false
  let eatClick = false
  let queuedCut = false
  const frame = blankInput()
  const held = blankInput()
  const shown: Card[] = [describe(build, CARD.heal), describe(build, CARD.heal), describe(build, CARD.heal), describe(build, CARD.heal)]
  let offerCount = 3
  let debugClock = 0
  let stats = { calls: 0, triangles: 0, geometries: 0, textures: 0 }
  const audit =
    damageAmount(10, true, 'weapon', 0) === 20 &&
    damageAmount(10, false, 'weapon', 0) === 5 &&
    damageAmount(45, false, 'cut', 0) === 45 &&
    damageAmount(45, true, 'cut', 0) === 90

  const floats = createFloats(container, TUNING.tiers.high.floats)
  const audio = createAudio(() => fxRng())
  temple.onRumble = () => audio.rumble()
  const toast = document.createElement('div')
  toast.id = 'toast'
  toast.hidden = true
  container.append(toast)
  let exposePops = 0
  let toastTimer = 0
  let xpStep = 0
  let cutWas = false
  let washSlow = 0
  let litBurst = 0
  let stepAcc = 0
  let litBurstAt = 0
  let flareCd = 6
  let bellCd = 10
  let previewSweepX = 0
  let previewSweepZ = -1
  let previewSweepN = 0
  let profHorde = 0
  let profSpear = 0
  let profHalo = 0
  let profFx = 0
  let profBloom = 0
  let profSync = 0
  let sparkVis = 0
  const armFloatAt = new Float32Array(TUNING.hordeCap)
  const fxSeed = forcedSeed ?? 1
  let fxState = fxSeed >>> 0
  function fxRng() {
    fxState = (fxState + 0x6d2b79f5) >>> 0
    let t = fxState
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function devTools(): boolean {
    return import.meta.env.DEV || params.get('dev') === '1'
  }

  function sunLit(x: number, z: number): boolean {
    return sun.isLit(x, z)
  }

  function litAt(x: number, z: number): boolean {
    if (activeMap === 'cloister' && cloister?.ready) return cloister.isLit(x, z)
    if (activeMap === 'lattice' && lattice?.ready) return lattice.isLit(sunLit, x, z)
    return sunLit(x, z)
  }

  const ctx: HordeCtx = {
    dt: 0,
    time: 0,
    tick: 0,
    px: 0,
    pz: 0,
    playerR: player.radius,
    iframe: 0,
    invuln: 0,
    vulnerable: () => player.iframe <= 0 && player.invuln <= 0,
    separate: true,
    might: 0,
    searing: 0,
    isLit: (x, z) => litAt(x, z),
    shadeZ: -1000,
    bloomLive: false,
    guide: null,
    deep: null,
    lureX: 0,
    lureZ: 0,
    lureR2: 0,
    pass: false,
    onHit(x, z, amount, lit, killed, index) {
      audio.hit()
      const bigHit = amount >= TUNING.cut.damage
      const crit = killed && lit
      if (lit) audio.exposed()
      else audio.armored()
      if ((bigHit || crit) && (lit || time - (armFloatAt[index] ?? 0) >= 0.35)) {
        if (!lit) armFloatAt[index] = time
        floats.push(x, z, `${Math.round(amount)}`, crit ? 'crit' : lit ? 'hot' : 'arm')
      }
      if (killed) audio.kill(lit)
      if (killed && lit) {
        if (time - litBurstAt > 0.12) litBurst = 0
        litBurst++
        litBurstAt = time
        if (litBurst >= TUNING.exposedBurst) hitStop = Math.max(hitStop, TUNING.exposedStop)
        shakeAmp = Math.max(shakeAmp, TUNING.exposedShake)
        shakeT = Math.max(shakeT, TUNING.shakeDecay)
      }
    },
    onExpose(x, z) {
      audio.shimmer()
      if (exposePops < 5) {
        exposePops++
        floats.push(x, z, 'EXPOSED!', 'pop')
      }
    },
    onHurt(amount) {
      if (!hurtPlayer(player, amount)) return
      animHurt = true
      if (storageGet('noonsworn.shake') !== '0') {
        shakeAmp = TUNING.hurtShake
        shakeT = TUNING.shakeDecay
      }
      hitStop = Math.max(hitStop, TUNING.hurtStop)
      audio.hurt()
      buzz(24)
      bus.emit('hurt', { amount })
    },
    onXp(x, z, value) {
      pickups.spawn(x, z, value, TUNING.tiers[quality.tier].xp, player.x, player.z)
      tutorial.onShard()
    },
    onKill() {
      kills++
      tutorial.onKill()
    },
    onEmber(x, z) {
      fx.death(x, z, true)
      const big = build.searing >= 5
      const size = big ? 1.7 : 1.2
      fx.scorch(x, z, 0, size, size, 0.7, big)
      fx.ember(x, z, false)
    },
    onSpark(x, z, lit) {
      sparkVis++
      if (sparkVis > 4) return
      fx.ember(x, z, lit && build.searing >= 5)
    },
    onDeath(x, z, lit) {
      fx.death(x, z, lit)
      if (activeMap === 'lattice' && lattice?.bloom(x, z, lit)) audio.coinBloom()
    },
  }

  function buzz(ms: number) {
    if (storageGet('noonsworn.haptics') === '0') return
    const nav = navigator as Navigator & { vibrate?: (pattern: number) => boolean; userActivation?: { hasBeenActive: boolean } }
    if (typeof nav.vibrate !== 'function') return
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return
    nav.vibrate(ms)
  }

  function shakeOn(): boolean {
    return storageGet('noonsworn.shake') !== '0'
  }

  function endDetail() {
    const whole = Math.max(0, Math.floor(time))
    const m = Math.floor(whole / 60)
    const s = whole % 60
    return `${m}:${s < 10 ? '0' : ''}${s}   ${kills} kills   level ${build.level}`
  }

  function applyPresentation() {
    gpu.resize(quality.ratio)
    bloom.setSize(canvas.width, canvas.height)
    const fog = quality.tier !== 'low'
    gpu.setFog(fog)
    sun.pushUniforms(floor.uniforms, fog)
    if (!(previewWeapon && previewHold)) horde.cullTo(quality.cap, player.x, player.z)
    featureMap.refresh()
  }
  quality.onChange = () => applyPresentation()
  applyPresentation()

  function showMode(next: ScreenMode) {
    mode = next
    screens.setMode(next, next === 'dead' || next === 'clear' ? endDetail() : undefined)
    const playUi = next === 'playing' || next === 'paused' || next === 'level'
    hud.setVisible(playUi)
    sundial.root.hidden = !playUi
    if (!playUi) touchView.hide()
    if (next === 'dead' || next === 'clear') {
      endAt = performance.now()
      if (next === 'dead') audio.death()
      else audio.win()
      if (noteRun(activeMap, time, kills, next === 'clear')) {
        if (activeMap === 'cloister') {
          screens.setToast('The Westering Stair — coming soon')
          showToast('The Westering Stair — coming soon', 4.2)
          markSeen('stair')
        } else {
          screens.setToast('New temple opened')
          if (activeMap === 'lattice') markSeen('cloister')
          else if (activeMap === 'sundial') markSeen('lattice')
        }
      }
    } else {
      screens.setToast(null)
      if (next === 'menu' || next === 'splash') audio.stopMusic()
    }
    if (next !== 'level') levelUp.hide()
  }

  function enemyLitNear(): boolean {
    let found = false
    horde.visit((ex, ez) => {
      if (found) return
      const dx = ex - player.x
      const dz = ez - player.z
      if (dx * dx + dz * dz > 36) return
      if (litAt(ex, ez)) found = true
    })
    return found
  }

  function noteOffer(count: number) {
    if (!tipsEnabled()) return
    for (let i = 0; i < count; i++) {
      const card = shown[i]
      if (card && isSunBoon(card.id)) tips.notify('boon')
    }
  }

  function fillCtx(dt: number) {
    ctx.dt = dt
    ctx.time = time
    ctx.tick = tick
    ctx.px = player.x
    ctx.pz = player.z
    ctx.iframe = player.iframe
    ctx.invuln = player.invuln
    ctx.separate = tick % (quality.tier === 'low' ? 2 : 1) === 0
    ctx.might = build.might
    ctx.searing = build.searing
    ctx.guide = activeMap === 'cloister' && cloister ? cloister.guide : temple.routing() ? temple.guide : null
    ctx.deep = activeMap === 'cloister' && cloister ? cloister.deep : null
    ctx.pass = traps.phasing()
    ctx.lureX = traps.decoyX()
    ctx.lureZ = traps.decoyZ()
    ctx.lureR2 = traps.decoyR2()
    ctx.shadeZ = activeMap === 'lattice' && lattice ? lattice.shadeZ() : -1000
    ctx.bloomLive = activeMap === 'lattice' && lattice ? lattice.blooming() : false
  }

  function openLevel() {
    const sunlit = litAt(player.x, player.z)
    offerCount = rollCards(build, rng, shown, sunlit ? 4 : 3)
    noteOffer(offerCount)
    levelUp.show(shown.slice(0, offerCount), sunlit)
    buzz(18)
    if (mode !== 'level') showMode('level')
  }

  function closeOffer() {
    levelUp.hide()
    if (mode === 'level') showMode('playing')
  }

  function applyCard(id: number) {
    const step = cardStep(build, id)
    const cap = TUNING.passive.max
    if (id === CARD.spear && build.spear < cap) {
      build.spear = Math.min(cap, build.spear + step)
      noteJump(build, id, step)
    } else if (id === CARD.halo && build.halo < cap) {
      build.halo = Math.min(cap, build.halo + step)
      noteJump(build, id, step)
    } else if (id === CARD.flare && build.flare < cap) {
      build.flare = Math.min(cap, build.flare + step)
      noteJump(build, id, step)
    } else if (id === CARD.bell && build.bell < cap) {
      build.bell = Math.min(cap, build.bell + step)
      noteJump(build, id, step)
    } else if (id === CARD.might && build.might < cap) build.might++
    else if (id === CARD.haste && build.haste < cap) build.haste++
    else if (id === CARD.swift && build.swift < cap) build.swift++
    else if (id === CARD.lodestone && build.lodestone < cap) build.lodestone++
    else if (id === CARD.vitality && build.vitality < cap) {
      build.vitality++
      player.maxHp += TUNING.passive.vitalHp
      player.hp = Math.min(player.maxHp, player.hp + TUNING.passive.vitalHeal)
    } else if (id === CARD.wide && build.wide < TUNING.wideMax) {
      build.wide++
      sun.setWide(build.wide)
    } else if (id === CARD.longday && build.longday < cap) build.longday++
    else if (id === CARD.searing && build.searing < cap) build.searing++
    else if (id === CARD.mirage && build.mirage === 0) build.mirage = 1
    else {
      player.hp = Math.min(player.maxHp, player.hp + TUNING.healCard)
    }
    build.pending = Math.max(0, build.pending - 1)
    animFlourish = true
  }

  function takeCard(index: number) {
    if (mode !== 'level') return
    audio.ui()
    tutorial.onClaim()
    applyCard(shown[index]?.id ?? CARD.heal)
    hud.setCharges(build.pending)
    if (build.pending > 0) openLevel()
    else closeOffer()
  }

  function bankCharges() {
    audio.chime()
    hud.pulse()
    hud.setCharges(build.pending)
    tutorial.onCharge()
    if (!autopickEnabled()) return
    while (build.pending > 0) {
      const sunlit = litAt(player.x, player.z)
      offerCount = rollCards(build, rng, shown, sunlit ? 4 : 3)
      noteOffer(offerCount)
      const index = recommendIndex(build, shown, offerCount)
      const card = shown[index]
      showToast(card?.name ?? 'Upgrade', 2)
      tutorial.onClaim()
      applyCard(card?.id ?? CARD.heal)
    }
    hud.setCharges(build.pending)
  }

  function spawnBench() {
    horde.clear()
    for (let i = 0; i < TUNING.benchMites; i++) {
      const x = -70 + (i % 15) * 1.1
      const z = -70 + Math.floor(i / 15) * 1.1
      horde.spawn(0, x, z, true)
    }
  }

  horde.onHit = ctx.onHit
  horde.onExpose = ctx.onExpose
  horde.onSpawn = (kind) => {
    if (kind === 1) tips.notify('hound')
  }
  horde.onDart = () => audio.darterDart()
  horde.bossHit = (x, z, radius, base, source, might, stamp) => {
    if (activeMap === 'lattice' && lattice) return lattice.hitBoss(x, z, radius, base, source, might, stamp)
    if (activeMap === 'cloister' && cloister) return cloister.soak(x, z, radius, base, source, might, stamp)
    return false
  }

  function clearedNow(): boolean {
    if (activeMap === 'lattice') return !!lattice?.cleared()
    if (activeMap === 'cloister') return !!cloister?.cleared()
    return time >= TUNING.runLength
  }

  function showToast(text: string, seconds = 3.2) {
    toast.textContent = text
    toast.hidden = false
    toastTimer = seconds
  }

  function ensureLattice(): Promise<void> {
    if (lattice?.ready) return Promise.resolve()
    if (!latticeGate) {
      latticeGate = import('./lattice')
        .then(async (mod) => {
          const mat = horde.darterMesh.material
          if (Array.isArray(mat) || !(mat instanceof ShaderMaterial)) throw new Error('enemy material')
          const handle = mod.createLattice({
            scene: gpu.scene,
            uniforms: floor.uniforms,
            enemyMat: mat,
            mite: horde.miteMesh,
            hound: horde.houndMesh,
            darter: horde.darterMesh,
            hide: [floorMesh, shell, pillars, wingFloor, wingPillars, inlay],
            restore: [floorMesh, shell, pillars, inlay],
            spawn: (kind, x, z) => {
              horde.spawn(kind, x, z, false, 56, player.x, player.z)
            },
            cull: (n) => horde.cullTo(n, player.x, player.z),
            hurt: (amount) => ctx.onHurt(amount),
            mark: (x, z, radius, seconds) => fx.ring(x, z, radius, FX.gold, seconds),
            expose: (x, z, half, freeze) => horde.exposeBox(x, z, half, freeze),
            track: (at) => {
              horde.bossAt = at
            },
            sfx: {
              shutterOpen: () => audio.shutterOpen(),
              shutterClose: () => audio.shutterClose(),
              rake: () => audio.espalierRake(),
              slam: () => audio.espalierSlam(),
              wake: () => audio.espalierWake(),
            },
          })
          lattice = handle
          await handle.load()
        })
        .finally(() => {
          latticeGate = null
        })
    }
    return latticeGate ?? Promise.resolve()
  }

  function ensureCloister(): Promise<void> {
    if (cloister?.ready) return Promise.resolve()
    if (!cloisterGate) {
      cloisterGate = import('./cloister')
        .then((mod) => {
          cloister = mod.createCloister({
            scene: gpu.scene,
            uniforms: floor.uniforms,
            hide: [floorMesh, shell, pillars, wingFloor, wingPillars, inlay],
            restore: [floorMesh, shell, pillars, inlay],
            preload: (names) => audio.preload(names),
            lowpass: (hz) => audio.lowpass(hz),
            hooks: {
              hurt: (amount, floorHp) => {
                if (floorHp && player.hp - amount < 1) {
                  player.hp = 1
                  player.invuln = Math.max(player.invuln, TUNING.player.invuln)
                  return
                }
                ctx.onHurt(amount)
              },
              slow: (seconds) => {
                washSlow = Math.max(washSlow, seconds)
              },
              pushPlayer: (x, z) => {
                player.x = x
                player.z = z
                player.px = x
                player.pz = z
              },
              vulnerable: () => player.iframe <= 0 && player.invuln <= 0 && !cut.active,
              each: (fn) => horde.each(fn),
              damage: (index, base, source, might) => horde.damage(index, base, source, might),
              place: (index, x, z) => horde.place(index, x, z),
              stagger: (index, seconds) => horde.staggerFor(index, seconds),
              wash: (index, seconds) => horde.washFor(index, seconds),
              xp: (x, z, value) => pickups.spawn(x, z, value, TUNING.tiers[quality.tier].xp, player.x, player.z),
              ping: (x, z, lit) => fx.hit(x, z, lit),
              spawn: (kind, x, z) => horde.spawn(kind, x, z, false, 56, player.x, player.z),
              cull: (n) => horde.cullTo(n, player.x, player.z),
              track: (at) => {
                horde.bossAt = at
              },
              sfx: (name) => audio.cue(name),
            },
          })
        })
        .finally(() => {
          cloisterGate = null
        })
    }
    return cloisterGate ?? Promise.resolve()
  }

  function waterCode(name: string | null): number | null {
    if (name === 'fill') return 4
    if (name === 'brim') return 17
    if (name === 'ebb') return 30
    if (name === 'low') return 47
    if (name === 'surge') return 0.3
    return null
  }

  function noteHint(t: number, prev: number) {
    if (activeMap !== 'cloister' || previewWeapon || t - prev > 1) return
    const say = (bit: number, text: string) => {
      if (hintBits & bit) return
      hintBits |= bit
      storageSet('noonsworn.cloister.hints', String(hintBits))
      showToast(text, 4.2)
    }
    if (t >= 2 && t < 8 && prev < 2) say(1, 'High water throws the sun under the arches.')
    if (t >= 31 && t < 40 && prev < 31) say(2, 'Low water: the arches go deep. Hold the bright stone.')
  }

  function startRun() {
    if (wantMap === 'lattice' && !lattice?.ready) {
      if (latticePending) return
      latticePending = true
      void ensureLattice()
        .then(() => {
          latticePending = false
          if (wantMap === 'lattice') startRun()
        })
        .catch((err) => {
          latticePending = false
          wantMap = 'sundial'
          if (import.meta.env.DEV) console.error(err)
          startRun()
        })
      return
    }
    if (wantMap === 'cloister' && !cloister?.ready) {
      if (cloisterPending) return
      cloisterPending = true
      void ensureCloister()
        .then(() => {
          cloisterPending = false
          if (wantMap === 'cloister') startRun()
        })
        .catch((err) => {
          cloisterPending = false
          wantMap = 'sundial'
          if (import.meta.env.DEV) console.error(err)
          startRun()
        })
      return
    }
    rng = mulberry32(queuedSeed ?? forcedSeed ?? (Date.now() >>> 0))
    queuedSeed = null
    resetPlayer(player)
    resetCut(cut)
    build = createBuild()
    sun.reset(rng)
    sun.setWide(0)
    director.reset()
    horde.clear()
    spears.clear()
    halo.clear()
    pickups.clear()
    fx.clear()
    time = 0
    prevStep = 0
    kills = 0
    tick = 0
    hitStop = 0
    shakeT = 0
    follow.snap(0, 0)
    exposePops = 0
    flareCd = 6
    bellCd = 10
    audio.startMusic()
    activeMap = wantMap
    resetHomePillars()
    setBeds([])
    temple.setRouting(activeMap === 'lattice' || activeMap === 'cloister')
    temple.reset(rng)
    traps.reset(temple)
    if (activeMap === 'lattice' && lattice) {
      cloister?.clear(false)
      outer.position.y = -0.05
      lattice.apply()
      lattice.warm(gpu.renderer, follow.camera)
      prewarmDraw()
    } else if (activeMap === 'cloister' && cloister) {
      lattice?.clear()
      outer.position.y = -2.2
      cloister.apply()
      cloister.pin(sun)
      if (!previewWeapon) {
        player.x = 0
        player.z = 13
        player.px = 0
        player.pz = 13
        player.yaw = 0
        follow.snap(0, 13)
      }
      const pinned = import.meta.env.DEV ? waterCode(params.get('water')) : null
      if (pinned != null) cloister.hold(sun, pinned)
      cloister.tick(0, sun, build.wide, player.x, player.z)
      writeFloorPillars(floor.uniforms.uPillars.value, floor.uniforms.uPillarN)
      cloister.warm(gpu.renderer, follow.camera)
      prewarmDraw()
    } else {
      cloister?.clear(false)
      outer.position.y = -0.05
      lattice?.clear()
    }
    hud.setCharges(0)
    levelUp.hide()
    featureMap.close()
    showMode('playing')
    tutorial.begin(!previewWeapon && !turnWho && tipsEnabled())
    ads.gameplayStart()
    swallow = true
    if (previewWeapon) armPreview()
    if (import.meta.env.DEV && turnWho === 'mite') horde.spawn(0, 0, 0, false, 8, 0, 0)
    if (import.meta.env.DEV && turnWho === 'hound') horde.spawn(1, 0, 0, false, 8, 0, 0)
    if (import.meta.env.DEV && (turnWho === 'mite' || turnWho === 'hound')) horde.frozen = true
  }

  function armPreview() {
    const rank = Math.max(1, Math.min(5, previewRank))
    const all = previewWeapon === 'all'
    const use = (name: string) => all || previewWeapon === name
    build.spear = use('sunspear') ? rank : 0
    build.halo = use('halo') ? rank : 0
    build.flare = use('flare') ? rank : 0
    build.bell = use('bell') ? rank : 0
    build.searing = use('searing') ? rank : 0
    if (all) {
      build.spear = 5
      build.halo = 5
      build.flare = 5
      build.bell = 5
      build.searing = 5
    }
    if (previewWeapon === 'hits') {
      build.spear = 3
      build.halo = 3
      build.flare = 0
      build.bell = 0
      build.searing = 0
      player.x = 12
      player.z = 0
      player.px = 12
      player.pz = 0
      follow.snap(12, 0)
    }
    sun.theta0 = -Math.PI / 2
    sun.dir = 1
    sun.time = 0
    sun.frozen = false
    sun.advance(0)
    sun.frozen = true
    player.iframe = 40
    player.yaw = 0
    const tierName = previewTier === 'low' || previewTier === 'med' || previewTier === 'high' ? previewTier : 'high'
    quality.forceTier(tierName)
    quality.setDynresEnabled(false)
    const heavy = all || params.get('bench') === '1'
    const requested = Number(params.get('n') ?? (heavy ? '400' : '90'))
    let swarm = Number.isFinite(requested) ? requested : heavy ? 400 : 90
    swarm = heavy ? Math.max(1, Math.min(400, swarm)) : Math.max(60, Math.min(120, swarm))
    if (previewShow) {
      showX = previewWeapon === 'hits' ? 11 : 0
      showZ = 0
      player.x = showX
      player.z = showZ
      player.px = showX
      player.pz = showZ
      follow.snap(showX, showZ)
      if (previewWeapon === 'hits') {
        build.spear = 0
        build.halo = 0
        build.flare = 0
        build.bell = 0
        build.searing = 0
      }
      const ring = 16
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2
        horde.spawn(0, showX + Math.cos(a) * 7, showZ + Math.sin(a) * 7, false, 400, showX, showZ)
      }
      horde.frozen = true
      showIn = 0.08
      previewFires = 0
    } else if (previewWeapon === 'hits') {
      litAx = 8.6
      litAz = 0.2
      shadeAx = 15.4
      shadeAz = -0.2
      for (let i = 0; i < 8; i++) {
        const z = ((i % 4) - 1.5) * 0.7
        const row = Math.floor(i / 4)
        horde.spawn(0, 8.2 + row * 0.4, z, false, 400, 12, 0)
        horde.spawn(0, 15.1 + row * 0.35, z, false, 400, 12, 0)
      }
    } else {
      for (let i = 0; i < swarm; i++) {
        const ang = i * 2.399963
        const dist = heavy ? 6 + (i % 12) * 0.5 : 6 + (i % 8) * 0.75
        horde.spawn(i % 14 === 0 ? 1 : 0, Math.cos(ang) * dist, Math.sin(ang) * dist, false, 400, 0, 0)
      }
    }
    flareCd = 0.15
    bellCd = 0.35
    previewCutIn = 0.2
    cutMark = -1
    hitPreview = 0.15
  }

  function spawnStress(n: number) {
    if (mode !== 'playing' && mode !== 'paused') startRun()
    for (let i = 0; i < n; i++) {
      const ang = rng() * Math.PI * 2
      const dist = 16 + rng() * 6
      horde.spawn(0, player.x + Math.cos(ang) * dist, player.z + Math.sin(ang) * dist, false, quality.cap, player.x, player.z)
    }
  }

  spears.onWindup = () => {
    animThrow = true
  }
  spears.onFire = () => {
    previewFires++
    audio.spear()
  }
  const mapSelect = createMapSelect(ui, (id) => {
    audio.ui()
    wantMap = id
    rememberMap(id)
    mapSelect.close()
    startRun()
  })
  screens.onPlay = () => {
    audio.ui()
    if (import.meta.env.DEV && params.get('map') === 'lattice') {
      wantMap = 'lattice'
      startRun()
      return
    }
    if (import.meta.env.DEV && params.get('map') === 'cloister') {
      wantMap = 'cloister'
      startRun()
      return
    }
    const saved = loadMaps()
    if (saved.unlocked.some((id) => id !== 'sundial')) {
      mapSelect.open(saved)
      if (saved.unlocked.includes('cloister') && !saved.seen.includes('cloister') && markSeen('cloister')) {
        mapSelect.toast('New temple opened')
      }
      return
    }
    wantMap = 'sundial'
    startRun()
  }
  screens.onRestart = () => {
    audio.ui()
    mapSelect.close()
    startRun()
  }
  screens.onResume = () => {
    if (mode === 'paused') {
      showMode('playing')
      ads.gameplayStart()
    }
  }
  screens.onFeature = () => {
    if (!devTools()) return
    featureMap.toggle()
  }
  screens.onQuit = () => {
    featureMap.close()
    showMode('menu')
    ads.gameplayStop()
  }
  screens.onScreen = (next) => showMode(next)
  screens.onHover = () => audio.ui()
  screens.onQuality = (value) => {
    if (value === 'auto') quality.autoDrop = true
    else quality.forceTier(value)
  }
  screens.onTips = (on) => {
    tips.setEnabled(on)
    tutorial.setEnabled(on)
    if (on && mode === 'playing') tutorial.begin(true)
  }
  screens.onResetTutorial = () => {
    tutorial.reset()
    if (mode === 'playing' && tipsEnabled()) tutorial.begin(true)
  }
  if (!params.get('tier')) {
    const pref = storageGet('noonsworn.quality.pref')
    if (pref === 'auto' || pref === 'low' || pref === 'med' || pref === 'high') screens.setQuality(pref)
  }
  hud.onHalo = () => {
    audio.ui()
    if (mode === 'playing' && build.pending > 0) openLevel()
  }
  function applyStoredAudio() {
    audio.setMuted(document.hidden || storageGet('noonsworn.mute') === '1')
    audio.setMusic(Number(storageGet('noonsworn.music') ?? '45') / 100)
    audio.setSfx(Number(storageGet('noonsworn.sfx') ?? '90') / 100)
  }
  applyStoredAudio()
  screens.onAudio = (which, value) => {
    if (which === 'music') audio.setMusic(value / 100)
    else if (which === 'sfx') audio.setSfx(value / 100)
    else audio.setMuted(value === 1 || document.hidden)
  }
  hud.onPause = () => {
    audio.ui()
    if (mode === 'playing') {
      showMode('paused')
      ads.gameplayStop()
    } else if (mode === 'paused') {
      showMode('playing')
      ads.gameplayStart()
    }
  }
  levelUp.onPick = (index) => {
    if (mode === 'level') {
      audio.ui()
      applyCard(shown[index]?.id ?? CARD.heal)
    }
  }
  debug.onTier = (tier: TierName) => quality.forceTier(tier)
  debug.onSpawn = () => spawnStress(50)
  debug.onFreeze = () => {
    sun.frozen = !sun.frozen
  }
  debug.onDynres = (on) => quality.setDynresEnabled(on)
  bus.on('runEnd', () => ads.gameplayStop())

  sun.reset(mulberry32(forcedSeed ?? 1))
  spawnBench()
  requestAnimationFrame(() => loadArt(floor.uniforms, {
    pillar: pillarMat,
    walls: wallMat,
    outer: outerMat,
    sky: skyMat,
    inlay: inlayMat,
  }, (slots) => {
    const base = import.meta.env.BASE_URL
    if (slots.cards) levelUp.arm(`${base}assets/art/${slots.cards}`)
    const artUrl = slots.keyart ? `url(${base}assets/art/${slots.keyart})` : ''
    if (artUrl) (document.querySelector('#screens') as HTMLElement | null)?.style.setProperty('--keyart', artUrl)
    for (const id of ['#splash-screen', '#menu-screen']) {
      const el = document.querySelector(id) as HTMLElement | null
      if (el && artUrl) el.style.backgroundImage = artUrl
    }
    if (slots.logo) {
      document.querySelectorAll('.logo-slot').forEach((heading) => {
        heading.textContent = ''
        const img = document.createElement('img')
        img.src = `${base}assets/art/${slots.logo}`
        img.alt = 'NOONSWORN'
        heading.append(img)
      })
    }
  }))
  if (params.get('debug') === '1') debug.open()
  if (import.meta.env.DEV) {
    const pace = window as unknown as { __pace?: () => { t: number; level: number; xp: number; next: number; pending: number } }
    pace.__pace = () => ({ t: time, level: build.level, xp: build.xp, next: xpToNext(build.level), pending: build.pending, lit: litAt(player.x, player.z) })
  }
  if (previewWeapon) {
    const hook = window as unknown as {
      __ns?: () => {
        calls: number
        fx: number
        hot: number
        spears: number
        enemies: number
        kills: number
        cut: number
        halo: number
        hordeMs: number
        spearMs: number
        haloMs: number
        fxMs: number
        bloomMs: number
        syncMs: number
        fires: number
        selaX: number
        selaZ: number
        selaPx: number
        selaM: number
        selaBones: number
        miteTris: number
        houndTris: number
        selaTris: number
        t: number
        selaMat: string
      }
    }
    hook.__ns = () => ({
      calls: stats.calls,
      fx: fx.mesh.count,
      hot: fx.hot.count,
      spears: spears.mesh.count,
      enemies: horde.count(),
      kills,
      cut: cut.active ? 1 : 0,
      halo: halo.mesh.count,
      hordeMs: Math.round(profHorde * 100) / 100,
      spearMs: Math.round(profSpear * 100) / 100,
      haloMs: Math.round(profHalo * 100) / 100,
      fxMs: Math.round(profFx * 100) / 100,
      bloomMs: Math.round(profBloom * 100) / 100,
      syncMs: Math.round(profSync * 100) / 100,
      fires: previewFires + halo.pulses,
      selaX: player.x,
      selaZ: player.z,
      selaPx: Math.round(sela.focus.h * 10) / 10,
      selaM: Math.round(sela.focus.meters * 100) / 100,
      selaBones: sela.bones,
      miteTris: horde.tris.mite,
      houndTris: horde.tris.hound,
      selaTris: sela.tris,
      t: Math.round(time * 1000) / 1000,
      selaMat: sela.matNote,
    })
    if (import.meta.env.DEV && params.get('map') === 'lattice') wantMap = 'lattice'
    if (import.meta.env.DEV && params.get('map') === 'cloister') wantMap = 'cloister'
    requestAnimationFrame(() => startRun())
  } else if (turnWho) {
    requestAnimationFrame(() => startRun())
  }

  window.addEventListener('pointerdown', (e) => {
    const target = e.target
    if (!(target instanceof Element)) return
    if (mode === 'splash') {
      audio.unlock()
      audio.ui()
      eatClick = true
      showMode('menu')
      return
    }
    if (target.closest('button, label, input, select, #feature-map, #debug, #level-up, #screens')) return
    if ((mode === 'dead' || mode === 'clear') && performance.now() - endAt < 800) return
    if (mode === 'dead' || mode === 'clear') {
      audio.unlock()
      audio.ui()
      startRun()
      input.clearCut()
    }
  })
  window.addEventListener('click', (e) => {
    if (!eatClick) return
    eatClick = false
    e.preventDefault()
    e.stopPropagation()
  }, true)
  window.addEventListener('pointerdown', () => audio.unlock())
  window.addEventListener('keydown', () => audio.unlock())
  document.addEventListener('visibilitychange', () => {
    audio.setMuted(document.hidden || storageGet('noonsworn.mute') === '1')
    screens.setBeamPaused(document.hidden)
    if (document.hidden && mode === 'playing') {
      showMode('paused')
      ads.gameplayStop()
    }
  })
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault()
  }, { passive: false })

  const loop: LoopHost = {
    beginFrame(frameSec) {
      profHorde = 0
      profSpear = 0
      profHalo = 0
      follow.basis(basis)
      const front = mode === 'splash' || mode === 'menu' || mode === 'howto' || mode === 'settings' || mode === 'credits' || mode === 'paused' || mode === 'dead' || mode === 'clear'
      input.setNavLock(mode !== 'playing')
      input.readInto(frame, follow.camera)
      if (!featureMap.root.hidden && (frame.pausePressed || frame.cancelPressed)) {
        featureMap.close()
        frame.pausePressed = false
        frame.cancelPressed = false
      }
      if (build.mirage <= 0 && (frame.shiftPressed || frame.altPressed)) frame.cutPressed = true
      const hintDevice = input.device()
      screens.setDevice(hintDevice === 'touch' ? 'touch' : hintDevice === 'pad' ? 'pad' : 'keyboard')
      if (swallow) {
        frame.pausePressed = false
        frame.cutPressed = false
        queuedCut = false
        swallow = false
      }
      if (frame.cutPressed && mode === 'playing') queuedCut = true
      held.moveX = frame.moveX
      held.moveY = frame.moveY
      held.aimX = frame.aimX
      held.aimZ = frame.aimZ
      held.mouseIdle = frame.mouseIdle
      held.usingTouch = frame.usingTouch
      held.cutPressed = false
      held.cutDirX = null
      held.cutDirZ = null
      held.pick = -1
      if (frame.debugToggle) debug.toggle()
      if (frame.featureToggle && devTools()) featureMap.toggle()
      if (mapSelect.isOpen()) {
        const pick = mapSelect.read(frame.navX, frame.navY, frame.confirmPressed, frame.cancelPressed || frame.pausePressed)
        if (pick === 'back') {
          mapSelect.close()
          frame.pausePressed = false
          frame.cancelPressed = false
        }
        return false
      }
      if (frame.usingTouch) touchView.show()
      else touchView.hide()
      hud.setTouchMode(touchView.visible)
      if (mode === 'splash') {
        if (frame.keyPressed || frame.confirmPressed || frame.claimPressed || frame.cutPressed || frame.pick >= 0 || frame.pausePressed || frame.navX !== 0 || frame.navY !== 0 || frame.cancelPressed || (input.device() === 'pad' && frame.anyPressed)) {
          audio.unlock()
          audio.ui()
          showMode('menu')
          input.clearCut()
        }
        return false
      }
      if (front) {
        const ended = mode === 'dead' || mode === 'clear'
        screens.navigate(frame.navX, frame.navY, frame.confirmPressed && !ended)
        if (ended && frame.restartPressed) startRun()
        if ((mode === 'howto' || mode === 'settings' || mode === 'credits') && (frame.pausePressed || frame.cancelPressed)) screens.back()
        if (mode === 'paused' && (frame.pausePressed || frame.cancelPressed)) {
          showMode('playing')
          ads.gameplayStart()
        }
        return false
      }
      if (mode === 'level') {
        frame.cutPressed = false
        queuedCut = false
        if (frame.pausePressed || frame.cancelPressed) closeOffer()
        else if (frame.pick >= 0 && frame.pick < offerCount) takeCard(frame.pick)
        else {
          if (frame.navX !== 0) levelUp.move(frame.navX)
          if (frame.confirmPressed) levelUp.confirm()
        }
      } else if (frame.claimPressed && build.pending > 0) {
        openLevel()
      } else if (frame.pausePressed && mode === 'playing') {
        showMode('paused')
        ads.gameplayStop()
        return false
      }
      if (hitStop > 0) {
        hitStop -= frameSec
        if (hitStop < 0) hitStop = 0
        return false
      }
      if (queuedCut && mode === 'playing') {
        frame.cutPressed = true
        queuedCut = false
      }
      if (mode === 'level') return 0.15
      return mode === 'playing' ? 1 : false
    },
    step(dt, first) {
      sparkVis = 0
      const state = first ? frame : held
      if (clearedNow()) {
        showMode('clear')
        bus.emit('runEnd', { victory: true, time, kills, level: build.level })
        return false
      }
      sun.timeScale = Math.max(0.4, 1 - 0.12 * build.longday)
      if (!sun.frozen) sun.advance(dt)
      if (activeMap === 'lattice') lattice?.tick(dt, sun, time, player.x, player.z, sunLit)
      if (activeMap === 'cloister') cloister?.tick(dt, sun, build.wide, player.x, player.z, quality.tier !== 'high', time)
      temple.update(dt, time + dt, sun.time, player.x, player.z, sun.frozen)
      temple.mask(floor.uniforms.uWing.value)
      temple.kinds(floor.uniforms.uKind.value)
      const wing = floor.uniforms.uWing.value
      wingFloor.visible = wing.x + wing.y + wing.z + wing.w > 0
      if (activeMap === 'lattice') lattice?.veil()
      writeFloorPillars(floor.uniforms.uPillars.value, floor.uniforms.uPillarN)
      if (build.flare > 0 && !(previewShow && previewWeapon === 'flare')) {
        flareCd -= dt
        if (flareCd <= 0) {
          flareCd = 6
          const radius = flareRadius(build.flare)
          horde.radial(player.x, player.z, radius, 16, ctx)
          audio.exposed()
          const big = build.flare >= 5
          const same = big || build.flare === 1
          fx.ring(player.x, player.z, radius, FX.orange, 1.2)
          if (same) fx.ring(player.x, player.z, radius * 0.62, FX.orange, 1.2)
          previewFires++
          const bits = big ? 7 : 4
          for (let i = 0; i < bits; i++) {
            const a = (i / bits) * Math.PI * 2
            fx.ember(player.x + Math.cos(a) * radius * 0.4, player.z + Math.sin(a) * radius * 0.4, big)
          }
        }
      }
      if (build.bell > 0 && !(previewShow && previewWeapon === 'bell')) {
        bellCd -= dt
        if (bellCd <= 0) {
          bellCd = 10
          horde.slow(player.x, player.z, 5, 1.2)
          audio.bell()
          const big = build.bell >= 5
          fx.shell(player.x, player.z, big ? 6.4 : 5.2, 1.45)
          if (big) fx.shell(player.x, player.z, 4.4, 1.45)
          previewFires++
        }
      }
      if (previewShow && previewWeapon !== 'halo') {
        showIn -= dt
        if (showIn <= 0) {
          if (previewWeapon === 'sunspear') {
            showIn = 1
            spears.kick(player.x, player.z, 0.15, build.spear, TUNING.tiers[quality.tier].projectiles)
          } else if (previewWeapon === 'bell') {
            showIn = 1.15
            const big = build.bell >= 5
            fx.shell(player.x, player.z, big ? 6.4 : 5.2, 1.45)
            if (big) fx.shell(player.x, player.z, 4.4, 1.45)
            previewFires++
          } else if (previewWeapon === 'flare') {
            showIn = 0.9
            const radius = flareRadius(build.flare)
            const big = build.flare >= 5
            fx.ring(player.x, player.z, radius, FX.orange, 1.2)
            if (big || build.flare === 1) fx.ring(player.x, player.z, radius * 0.62, FX.orange, 1.2)
            previewFires++
          } else if (previewWeapon === 'cut') {
            showIn = 1
            const yaw = 0.5
            const dirX = -Math.sin(yaw)
            const dirZ = -Math.cos(yaw)
            const midX = player.x + dirX * TUNING.cut.distance * 0.5
            const midZ = player.z + dirZ * TUNING.cut.distance * 0.5
            const big = previewRank >= 5
            fx.scorch(midX, midZ, yaw, TUNING.cut.distance, 1.7, 1, big)
            fx.crescent(midX, midZ, yaw, big)
            previewFires++
          } else if (previewWeapon === 'hits') {
            showIn = 0.4
            fx.hit(showX - 1.8, showZ + 0.3, true)
            fx.hit(showX + 1.8, showZ - 0.2, false)
            previewFires++
          } else showIn = 1
        }
      }
      const steppedFrom = time
      time += dt
      noteHint(time, prevStep === 0 && steppedFrom === 0 ? 0 : prevStep)
      prevStep = time
      if (previewWeapon === 'flare' || previewWeapon === 'all') {
        if (flareCd > 0.9) flareCd = 0.9
      }
      if (previewWeapon === 'bell' || previewWeapon === 'all') {
        if (bellCd > 1.15) bellCd = 1.15
      }
      if (!previewShow && (previewWeapon === 'cut' || previewWeapon === 'all')) {
        previewCutIn -= dt
        if (previewCutIn <= 0) {
          previewCutIn = 0.8
          let tx = 0
          let tz = 0
          let n = 0
          for (let i = 0; i < horde.alive.length; i++) {
            if (!horde.alive[i]) continue
            const dx = (horde.x[i] ?? 0) - player.x
            const dz = (horde.z[i] ?? 0) - player.z
            if (dx * dx + dz * dz > 144) continue
            tx += dx
            tz += dz
            n++
          }
          const len = Math.hypot(tx, tz)
          const fx = len > 0.2 ? tx / len : 0
          const fz = len > 0.2 ? tz / len : -1
          const side = (previewSweepN % 2 === 0 ? 1 : -1) * 0.65
          previewSweepN++
          const sx = fx - fz * side
          const sz = fz + fx * side
          const sl = Math.hypot(sx, sz) || 1
          previewSweepX = sx / sl
          previewSweepZ = sz / sl
          // Same step as the timer. A press queued for the next frame is wiped
          // when that frame has no 60 Hz step.
          state.cutPressed = true
          state.cutDirX = previewSweepX
          state.cutDirZ = previewSweepZ
        }
      }
      let wishX = basis.rx * state.moveX + basis.fx * state.moveY
      let wishZ = basis.rz * state.moveX + basis.fz * state.moveY
      if (previewShow || previewWeapon === 'hits') {
        wishX = 0
        wishZ = 0
      } else if (previewWeapon) {
        const t = time * 0.8
        const ax = Math.sin(t) * 5.2
        const az = Math.sin(t * 2) * 2.4
        wishX = ax - player.x
        wishZ = az - player.z
        const mag = Math.hypot(wishX, wishZ) || 1
        const step = Math.min(1, mag)
        wishX = (wishX / mag) * step
        wishZ = (wishZ / mag) * step
      }
      if (!previewShow && (previewWeapon === 'cut' || previewWeapon === 'all') && state.cutPressed) {
        wishX = previewSweepX
        wishZ = previewSweepZ
        state.cutDirX = previewSweepX
        state.cutDirZ = previewSweepZ
      }
      if (washSlow > 0) washSlow = Math.max(0, washSlow - dt)
      const speed = TUNING.player.speed * (1 + TUNING.passive.swift * build.swift) * (washSlow > 0 ? 1 - TUNING.cloister.wash.selaSlow : 1)
      const slipped = traps.begin(dt, player)
      if (traps.blocksCut()) {
        cut.active = false
        cut.buffer = 0
      }
      fillCtx(dt)
      updateCut(cut, player, dt, {
        pressed: traps.blocksCut() ? false : state.cutPressed,
        dirX: state.cutDirX,
        dirZ: state.cutDirZ,
        wishX,
        wishZ,
        aimX: state.aimX,
        aimZ: state.aimZ,
        mouseIdle: state.mouseIdle,
        usingTouch: state.usingTouch,
      }, build.haste)
      if (cut.active && !cutWas) tutorial.onCut()
      if (!previewShow && (previewWeapon === 'cut' || previewWeapon === 'all') && cut.cooldown > 0.45) cut.cooldown = 0.45
      if (!slipped) integratePlayer(player, dt, wishX, wishZ, speed, cut.active, cut.dirX, cut.dirZ, cut.time)
      if (activeMap === 'cloister' && cloister) {
        const carried = cloister.shoveAt(player.x, player.z, player.radius)
        if (carried) {
          player.x = carried.x
          player.z = carried.z
        }
      }
      const wantMirage = build.mirage > 0 && (state.shiftPressed || state.altPressed || state.miragePressed)
      traps.after(dt, player, wishX, wishZ, horde, ctx, (x, z) => litAt(x, z), build.mirage > 0, build.haste, wantMirage && (first ?? false))
      if (traps.events.relic) {
        build.mirage = 1
        audio.relic()
        showToast('Mirage Sandals', 2.4)
      }
      if (traps.events.fire) audio.mirrorFire()
      if (traps.events.warn) audio.slabWarn()
      if (traps.events.slam) {
        audio.slabSlam()
        audio.duckTap()
      }
      if (traps.events.launch) audio.springLaunch()
      if (traps.events.land) {
        audio.springLand()
        audio.duckTap()
        if (shakeOn()) {
          shakeAmp = Math.max(shakeAmp, traps.events.shake)
          shakeT = Math.max(shakeT, TUNING.shakeDecay)
        }
        hitStop = Math.max(hitStop, traps.events.stop)
      }
      if (traps.events.mirage) audio.mirage()
      audio.setHums(traps.events.hum)
      if (traps.blocksCut()) {
        cut.active = false
        cut.buffer = 0
      }
      if (traps.phasing()) player.invuln = Math.max(player.invuln, dt + 0.02)
      if (previewShow) {
        player.x = showX
        player.z = showZ
        player.vx = 0
        player.vz = 0
        player.px = showX
        player.pz = showZ
      } else if (previewWeapon === 'hits') {
        player.x = 12
        player.z = 0
        player.vx = 0
        player.vz = 0
      } else if (previewWeapon && follow.camera.aspect < 1) {
        const lim = 7.5
        const pd = Math.hypot(player.x, player.z)
        if (pd > lim) {
          const s = lim / pd
          player.x *= s
          player.z *= s
          player.vx = 0
          player.vz = 0
        }
      }
      if (previewWeapon) player.iframe = Math.max(player.iframe, 30)
      if (cut.active && !cutWas) {
        cutMark = -1
        const slashYaw = yawFromDirection(cut.dirX, cut.dirZ)
        const midX = cut.sx + cut.dirX * TUNING.cut.distance * 0.5
        const midZ = cut.sz + cut.dirZ * TUNING.cut.distance * 0.5
        fx.scorch(midX, midZ, slashYaw, TUNING.cut.distance, 1.7, 1, false)
        fx.crescent(midX, midZ, slashYaw, false)
        fx.afterimage(player.x, player.z, cut.dirX, cut.dirZ)
        previewFires++
        audio.cut()
        buzz(16)
        if (shakeOn()) {
          shakeAmp = Math.max(shakeAmp, TUNING.cut.shake)
          shakeT = Math.max(shakeT, TUNING.shakeDecay)
        }
      }
      cutWas = cut.active
      if (cut.active) {
        sweepCut(cut, player, horde, build.might, ctx, () => {
          shakeAmp = Math.max(shakeAmp, Math.min(TUNING.hurtShake, TUNING.cut.shake + 0.03))
          shakeT = TUNING.shakeDecay
          const slashYaw = yawFromDirection(cut.dirX, cut.dirZ)
          fx.scorch(cut.sx + cut.dirX * TUNING.cut.distance * 0.5, cut.sz + cut.dirZ * TUNING.cut.distance * 0.5, slashYaw, TUNING.cut.distance, 1.7, 1, true)
          fx.crescent(player.x + cut.dirX * 1.6, player.z + cut.dirZ * 1.6, slashYaw, true)
        }, (hx, hz, lit) => {
          fx.hit(hx, hz, lit)
        })
        if (activeMap === 'cloister' && cloister) {
          cloister.cut(
            cut.sx,
            cut.sz,
            cut.sx + cut.dirX * TUNING.cut.distance,
            cut.sz + cut.dirZ * TUNING.cut.distance,
            true,
            cut.id,
            TUNING.player.radius,
            TUNING.cut.damage,
            build.might,
          )
        }
        if (cut.time - cutMark >= 0.04) {
          cutMark = cut.time
          const yaw = yawFromDirection(cut.dirX, cut.dirZ)
          const big = cut.boomed || cut.hits >= TUNING.cut.bigHits
          fx.crescent(player.x + cut.dirX * 1.6, player.z + cut.dirZ * 1.6, yaw, big)
        }
        if (cut.time >= TUNING.cut.duration) {
          cut.active = false
          cut.fade = TUNING.cut.ribbonFade
          const mag = Math.hypot(wishX, wishZ)
          if (mag > 1e-5) {
            player.vx = (wishX / mag) * speed * Math.min(1, mag)
            player.vz = (wishZ / mag) * speed * Math.min(1, mag)
          } else {
            player.vx = 0
            player.vz = 0
          }
        }
      }
      fillCtx(dt)
      const cam = follow.camera.position
      writeFloorPillars(floor.uniforms.uPillars.value, floor.uniforms.uPillarN)
      if (!horde.frozen && !turnWho) {
        const poured = temple.takeSpawns()
        const bossUp = activeMap === 'lattice' && (lattice?.bossing() ?? false)
        const cloisterBoss = activeMap === 'cloister' && (cloister?.bossing() ?? false)
        director.update(
          dt,
          time,
          horde,
          player.x,
          player.z,
          bossUp ? Math.min(quality.cap, 56) : cloisterBoss ? Math.min(quality.cap, 40) : quality.cap,
          rng,
          cam.x,
          cam.z,
          poured,
          temple.pickWing,
          activeMap === 'lattice' ? latticePlan(time, bossUp) : activeMap === 'cloister' && cloister ? cloister.plan(time) : undefined,
        )
      }
      const hordeT = performance.now()
      horde.update(ctx)
      if (activeMap === 'cloister' && cloister) {
        horde.shove((x, z, radius) => cloister?.shoveAt(x, z, radius) ?? null)
        pickups.shove((x, z) => cloister?.shoveAt(x, z, 0) ?? null)
        const touch = cloister.touch(player.x, player.z)
        if (touch > 0) ctx.onHurt(touch)
      }
      profHorde += performance.now() - hordeT
      if (!previewShow && previewWeapon === 'hits') {
        hitPreview -= dt
        if (hitPreview <= 0) {
          hitPreview = 0.4
          const litSpot: [number, number] = litAt(litAx, litAz) ? [litAx, litAz] : [player.x - 4.5, player.z]
          const shadeSpot: [number, number] = litAt(shadeAx, shadeAz) ? [player.x + 4.5, player.z] : [shadeAx, shadeAz]
          fx.hit(litSpot[0], litSpot[1], true, 2.5)
          fx.hit(shadeSpot[0], shadeSpot[1], false, 2.6)
        }
      }
      fx.setTier(quality.tier)
      if (previewShow && previewWeapon === 'sunspear') spears.cooldown = 30
      const spearT = performance.now()
      spears.update(dt, player.x, player.z, horde, build.spear, build.haste, build.might, TUNING.tiers[quality.tier].projectiles, ctx)
      profSpear += performance.now() - spearT
      const haloT = performance.now()
      halo.update(dt, player.x, player.z, horde, build.halo, build.might, time, ctx)
      profHalo += performance.now() - haloT
      const before = build.pending
      pickups.update(dt, player.x, player.z, TUNING.player.pickup * (1 + TUNING.passive.lode * build.lodestone), TUNING.tiers[quality.tier].xp, (value) => {
        xpWindow += value
        xpStep = (xpStep + 1) % 8
        audio.xp(xpStep)
        grantXp(build, value)
        tutorial.onCollect()
      })
      if (player.hp <= 0) {
        showMode('dead')
        bus.emit('runEnd', { victory: false, time, kills, level: build.level })
        return false
      }
      if (clearedNow()) {
        showMode('clear')
        bus.emit('runEnd', { victory: true, time, kills, level: build.level })
        return false
      }
      if (build.pending > before) {
        if (previewWeapon) build.pending = before
        else bankCharges()
      }
      if (previewWeapon && params.get('bench') === '1') {
        const want = Math.max(1, Math.min(400, Number(params.get('n') ?? '400') || 400))
        let guard = 0
        while (horde.count() < want && guard < 80) {
          const ang = guard * 2.399 + time
          const dist = 8 + (guard % 10) * 0.7
          horde.spawn(guard % 14 === 0 ? 1 : 0, player.x + Math.cos(ang) * dist, player.z + Math.sin(ang) * dist, false, 400, player.x, player.z)
          guard++
        }
      }
      tick++
      return hitStop <= 0
    },
    render(alpha, frameSec, frameMs) {
      const x = player.px + (player.x - player.px) * alpha
      const z = player.pz + (player.z - player.pz) * alpha
      let dy = player.yaw - player.prevYaw
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      const yaw = player.prevYaw + dy * alpha
      let sx = 0
      let sz = 0
      if (shakeT > 0) {
        shakeT -= frameSec
        if (shakeOn()) {
          const k = Math.max(0, shakeT / TUNING.shakeDecay)
          const amp = shakeAmp * k
          const now = performance.now() * 0.001
          sx = Math.sin(now * 70) * amp
          sz = Math.cos(now * 54) * amp
        }
      }
      follow.update(x, z, frameSec, sx, sz)
      const len = Math.hypot(sun.x, sun.z) || 1
      gpu.sunLight.position.set(x + (sun.x / len) * 16, 11, z + (sun.z / len) * 16)
      gpu.sunLight.target.position.set(x, 0, z)
      const lookDist = follow.lookDistance()
      const fogNear = lookDist + TUNING.arena.fogAhead
      const fogFar = lookDist + TUNING.arena.fogSpan
      gpu.setFogRange(fogNear, fogFar)
      floor.uniforms.uFogNear.value = fogNear
      floor.uniforms.uFogFar.value = fogFar
      const farNeed = lookDist + TUNING.arena.farPad
      if (follow.camera.far < farNeed) {
        follow.camera.far = farNeed
        follow.camera.updateProjectionMatrix()
      }
      sun.pushUniforms(floor.uniforms, quality.tier !== 'low')
      enemyTime().value = performance.now() * 0.001
      setEnemyLegSwing(quality.tier === 'high')
      audio.sample()
      const moving = Math.hypot(player.vx, player.vz)
      if (mode === 'playing' && moving > 0.8) {
        stepAcc += frameSec
        if (stepAcc >= 0.38) {
          stepAcc = 0
          audio.step()
        }
      } else stepAcc = 0
      if (import.meta.env.DEV && turnWho === 'sela') {
        const ang = Number(params.get('yaw') ?? '0')
        player.yaw = ang
        player.prevYaw = ang
      }
      if (import.meta.env.DEV && (turnWho === 'mite' || turnWho === 'hound')) {
        horde.face(Number(params.get('yaw') ?? '0'))
      }
      const groundY = activeMap === 'cloister' && cloister ? cloister.floorY(x, z) : activeMap === 'lattice' && lattice ? lattice.floorY(z) : 0
      playerView.position.set(x, traps.lift() + groundY, z)
      playerView.rotation.y = turnWho === 'sela' ? player.yaw : yaw
      const slashNow = halo.pulses !== animSlashSeen
      animSlashSeen = halo.pulses
      const animDt = mode === 'playing' || mode === 'dead' ? frameSec : 0
      sela.pose({
        dt: animDt,
        speed: Math.hypot(player.vx, player.vz),
        cutting: cut.active || cut.fade > 0,
        thrust: animThrust,
        slash: slashNow && halo.pulses > 0,
        throwing: animThrow,
        flourish: animFlourish,
        victory: mode === 'clear',
        hurt: animHurt,
        dead: player.hp <= 0,
        aspect: follow.camera.aspect,
        camera: follow.camera,
        viewW: canvas.clientWidth,
        viewH: canvas.clientHeight,
        hold: import.meta.env.DEV ? params.get('clip') : null,
        holdAt: import.meta.env.DEV && params.get('clipAt') ? Number(params.get('clipAt')) : undefined,
        sparse: quality.tier !== 'high',
      })
      if (sela.cue.throwRelease) {
        sela.spearTip(spearPoint)
        spears.release(spearPoint.x, spearPoint.z)
      }
      sela.spearTip(spearPoint)
      fx.hero(x, z)
      if (mode === 'playing' || mode === 'dead' || mode === 'clear') fx.anchor(spearPoint.x, spearPoint.y, spearPoint.z, playerView.rotation.y)
      if (sela.cue.slashHit && cut.hits > 0 && time - slashStopAt >= 0.3) {
        slashStopAt = time
        hitStop = Math.max(hitStop, 0.05)
      }
      animHurt = false
      animThrust = false
      animThrow = false
      animFlourish = false
      const hurtBlink = player.hp > 0 && player.invuln > 0 && ((player.invuln * 14) | 0) % 2 === 0
      playerView.visible = turnWho !== 'mite' && turnWho !== 'hound' && (player.hp <= 0 || !hurtBlink)
      sela.halo.visible = playerView.visible
      fx.setFocus(x, z)
      const syncT = performance.now()
      if (activeMap === 'cloister' && cloister) {
        const court = cloister
        horde.ground = (z, x = 0) => court.floorY(x, z)
      } else if (activeMap === 'lattice' && lattice) {
        const terrace = lattice
        horde.ground = (z) => terrace.floorY(z)
      } else {
        horde.ground = () => 0
      }
      horde.sync(follow.camera.position.x, follow.camera.position.z, quality.tier === 'high')
      profSync = performance.now() - syncT
      teleGate -= frameSec
      if (teleGate <= 0 && horde.telegraphs.length > 0) {
        teleGate = 0.12
        const lines = horde.telegraphs
        const shownLines = Math.min(lines.length, 8)
        for (let i = 0; i < shownLines; i++) {
          const mark = lines[i]
          if (!mark) continue
          fx.tele(mark.x, mark.z, mark.yaw)
        }
      }
      spears.sync()
      halo.sync(x, z, build.halo)
      pickups.sync((gx, gz) => litAt(gx, gz))
      shards.update(frameSec)
      const fxT = performance.now()
      fx.update(frameSec)
      profFx = performance.now() - fxT
      shadows.begin()
      shadows.put(x, z, 1.5 * 1.3)
      const marks = traps.blobs
      for (let i = 0; i < marks.length; i++) {
        const blob = marks[i]
        if (blob) shadows.put(blob.x, blob.z, blob.scale)
      }
      const blobReach = activeMap === 'lattice' ? 15 * 15 : 1e12
      horde.visit((ex, ez, kind) => {
        if (activeMap === 'lattice') {
          const dx = ex - x
          const dz = ez - z
          if (dx * dx + dz * dz > blobReach) return
        }
        shadows.put(ex, ez, kind === 0 ? 1.5 * 1.3 : 2.2 * 1.3)
      })
      pickups.visit((gx, gz) => shadows.put(gx, gz, 0.6 * 1.3))
      shadows.end()
      sky.position.y = follow.camera.position.y + skyHeight * (0.5 - skyHorizonV)
      const bloomT = performance.now()
      if (quality.tier === 'high') bloom.render(gpu.renderer, gpu.scene, follow.camera)
      else gpu.renderer.render(gpu.scene, follow.camera)
      profBloom = performance.now() - bloomT
      sunPip.render(gpu.renderer, follow.camera, x, z, sun.x, sun.z, canvas.clientHeight || window.innerHeight)
      stats = gpu.readStats()
      pushFrameSample(frameMs)
      xpWindowT += frameSec
      if (xpWindowT >= 1) {
        xpPerSec = xpWindow / xpWindowT
        xpWindow = 0
        xpWindowT = 0
      }
      quality.sample(frameMs, frameSec, mode === 'playing')
      if (toastTimer > 0) {
        toastTimer -= frameSec
        if (toastTimer <= 0) toast.hidden = true
      }
      floats.sync(follow.camera, canvas.clientWidth, canvas.clientHeight, frameSec)
      if ((mode === 'playing' || mode === 'level') && !previewWeapon && !turnWho) {
        tutorial.update(frameSec, player.x, player.z, follow.camera, canvas.clientWidth, canvas.clientHeight, {
          moving: Math.hypot(frame.moveX, frame.moveY) > 0.2,
          litNear: tutorial.active() ? enemyLitNear() : false,
          inLight: litAt(player.x, player.z),
          device: input.device(),
          charges: build.pending,
        })
        tips.update(frameSec)
      } else tutorial.conceal()
      floor.uniforms.uEdgeBoost.value = tutorial.outlining() ? 0.7 : 0
      hud.setCharges(build.pending)
      const ready = cut.cooldown <= 0 ? 1 : 1 - cut.cooldown / (TUNING.cut.cooldown * Math.max(0.2, 1 - TUNING.passive.haste * build.haste))
      hud.setHp(player.hp, player.maxHp)
      hud.setXp(build.xp, xpToNext(build.level), build.level)
      hud.setKills(kills)
      hud.setCooldown(ready)
      touchView.setCooldown(ready)
      hud.setMirage(build.mirage > 0, traps.ready())
      touchView.setOwned(build.mirage > 0)
      sundial.set(
        sun.angle,
        mode === 'playing' || mode === 'level' ? time : sun.time,
        temple.telegraph(),
        activeMap === 'lattice' && lattice ? lattice.terraceMask() : undefined,
        activeMap === 'cloister' ? { dir: sun.dir } : null,
      )
      const aim = temple.arrow()
      if (!aim || (mode !== 'playing' && mode !== 'level')) gateArrow.hidden = true
      else {
        arrowPoint.set(aim.x, 1.2, aim.z).project(follow.camera)
        const off = Math.abs(arrowPoint.x) > 0.9 || Math.abs(arrowPoint.y) > 0.9 || arrowPoint.z > 1
        gateArrow.hidden = !off
        if (off) {
          const ax = Math.max(-0.86, Math.min(0.86, arrowPoint.x))
          const ay = Math.max(-0.82, Math.min(0.82, arrowPoint.y))
          gateArrow.style.left = `${(ax * 0.5 + 0.5) * (canvas.clientWidth || 1)}px`
          gateArrow.style.top = `${(-ay * 0.5 + 0.5) * (canvas.clientHeight || 1)}px`
          gateArrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(-ay, ax)}rad)`
        }
      }
      if (debug.visible) {
        debugClock += frameSec
        if (debugClock >= 0.25) {
          debugClock = 0
          const summary = frameSummary(frameMs)
          const heard = audio.meter()
          debug.setText({
            fps: summary.fps,
            avg: summary.avg,
            low: summary.low,
            window: summary.window,
            frames: summary.frames,
            frameMs,
            tier: quality.tier,
            ratio: quality.ratio,
            dynres: quality.dynres.enabled,
            calls: stats.calls,
            triangles: stats.triangles,
            geometries: stats.geometries,
            textures: stats.textures,
            enemies: horde.count(),
            cap: quality.cap,
            exposed: horde.exposed(),
            angle: sun.angle,
            pools: `spear ${spears.used()}/${TUNING.tiers[quality.tier].projectiles}  xp ${pickups.used()}/${TUNING.tiers[quality.tier].xp}`,
            renderer: quality.renderer || 'masked',
            bloom: quality.tier !== 'low',
            extra: `${sun.frozen ? 'frozen' : 'moving'}  player ${litAt(player.x, player.z) ? 'lit' : 'shade'}  xp/s ${xpPerSec.toFixed(1)}  vsync ${quality.targetMs.toFixed(2)}  peak ${heard.peak.toFixed(1)}dB  voices ${heard.voices}  clip ${heard.clipped}  ads ${document.documentElement.dataset.ads ?? ads.last}  audit ${audit ? 'ok' : 'fail'}\nsfx ${sfxLine()}\ntris mite ${horde.tris.mite.toFixed(0)} hound ${horde.tris.hound.toFixed(0)} sela ${sela.tris.toFixed(0)}`,
          })
        }
      }
    },
  }
  await fx.ready
  warmScene()
  prewarmDraw()
  startLoop(loop)

  function prewarmDraw() {
    const hidden: { visible: boolean }[] = []
    const counts: { mesh: InstancedMesh; count: number }[] = []
    gpu.scene.traverse((obj) => {
      if (!obj.visible) {
        obj.visible = true
        hidden.push(obj)
      }
      const mesh = obj as InstancedMesh
      if (mesh.isInstancedMesh && mesh.count < 1) {
        counts.push({ mesh, count: mesh.count })
        mesh.count = 1
      }
    })
    fx.death(0, 0, true)
    fx.death(0.4, 0, false)
    fx.hit(0, 0, true)
    fx.hero(0, 0)
    fx.anchor(0, 1, 0, 0)
    fx.crescent(0, 0, 0, false)
    fx.afterimage(0, 0, 0, -1)
    fx.ring(0, 0, 1.2, FX.orange, 0.2)
    fx.ray(0, 1, 0, 0, 1.2, 0.12, 0.2)
    fx.update(0.016)
    if (fx.mesh.count < 1) fx.mesh.count = 1
    if (fx.hot.count < 1) fx.hot.count = 1
    shards.burst(0, 0, true)
    shards.burst(0.4, 0, false)
    shards.update(0.016)
    bloom.prewarmScene(gpu.renderer, gpu.scene, follow.camera)
    fx.clear()
    shards.update(2)
    for (const row of counts) row.mesh.count = row.count
    for (const obj of hidden) obj.visible = false
  }

  function warmScene() {
    const hidden: { visible: boolean }[] = []
    gpu.scene.traverse((obj) => {
      if (!obj.visible) {
        obj.visible = true
        hidden.push(obj)
      }
    })
    gpu.renderer.compile(gpu.scene, follow.camera)
    bloom.warm(gpu.renderer)
    for (let i = 0; i < hidden.length; i++) {
      const obj = hidden[i]
      if (obj) obj.visible = false
    }
  }

  function sfxLine(): string {
    const c = audio.counts()
    return Object.keys(c)
      .map((key) => `${key}:${c[key] ?? 0}`)
      .join(' ')
  }

  const api = {
    startRun,
    seedRun: (n: number) => {
      queuedSeed = n >>> 0
      startRun()
    },
    setMap: (id: 'sundial' | 'lattice' | 'cloister') => {
      if (id === 'sundial' || id === 'lattice' || id === 'cloister') wantMap = id
    },
    spawnStress,
    sun,
    player,
    horde,
    build: () => build,
    stats: () => stats,
    damageAmount,
    setTime: (t: number) => {
      time = t
    },
    setPlayer: (px: number, pz: number) => {
      player.x = px
      player.z = pz
      player.px = px
      player.pz = pz
      follow.snap(px, pz)
    },
    tick: (dt: number) => loop.step(dt, true),
    pressCut: () => {
      frame.cutPressed = true
    },
    renderNow: () => loop.render(1, 0.016, 16),
    pulseMirage: () => {
      frame.miragePressed = true
    },
    clearPulse: () => {
      frame.miragePressed = false
      frame.shiftPressed = false
      frame.altPressed = false
    },
    grantMirage: () => {
      build.mirage = 1
    },
    probe: () => {
      const c = follow.camera
      c.updateMatrixWorld()
      const e = c.matrixWorld.elements
      const fx = -(e[8] ?? 0)
      const fy = -(e[9] ?? 0)
      const fz = -(e[10] ?? 0)
      const pitch = (Math.atan2(-fy, Math.hypot(fx, fz)) * 180) / Math.PI
      return {
        fov: c.fov,
        pitch,
        dist: follow.lookDistance(),
        calls: stats.calls,
        tris: stats.triangles,
        programs: gpu.renderer.info.programs?.length ?? 0,
        textures: gpu.renderer.info.memory.textures,
        flow: temple.flowMs(),
        wings: temple.opened(),
        tele: temple.telegraph(),
        t: time,
        sun: sun.time,
        order: temple.order(),
        sides: temple.sides(),
        openTimes: temple.openTimes(),
        mirage: build.mirage,
        hp: player.hp,
        level: build.level,
        y: traps.lift(),
        ring: traps.ring(),
        phases: traps.phases(),
        mirageReady: traps.ready(),
        plates: temple.plates.map((p) => ({ kind: p.kind, x: p.x, z: p.z, boxX: p.boxX, boxZ: p.boxZ, side: p.side, lit: litAt(p.x, p.z) })),
      }
    },
    audioCounts: () => audio.counts(),
    meter: () => audio.meter(),
    time: () => time,
    mode: () => mode,
    blocked: (x: number, z: number) => cellBlocked(x, z),
    map: () => activeMap,
    shadeZ: () => (activeMap === 'lattice' && lattice ? lattice.shadeZ() : null),
    floorLit: (x: number, z: number) => litAt(x, z),
    floorSample: (step: number) => (activeMap === 'lattice' && lattice ? lattice.sample(sunLit, step) : 0),
    espalier: () => (activeMap === 'lattice' && lattice ? lattice.bossInfo() : null),
    shutters: () => (activeMap === 'lattice' && lattice ? lattice.plateInfo() : null),
    latticeTris: () => (lattice ? lattice.tris() : null),
    whenReady: () => cloisterGate ?? latticeGate ?? Promise.resolve(),
    water: () => (activeMap === 'cloister' && cloister ? cloister.info() : null),
    compline: () => (activeMap === 'cloister' && cloister ? { phase: cloister.phase(), boss: cloister.bossing(), clear: cloister.cleared(), times: cloister.times() } : null),
    debugPhase: (n: number) => {
      cloister?.debugPhase(n)
    },
    arm: () => {
      build.level = 13
      build.spear = 4
      build.halo = 3
      build.might = 4
      build.haste = 2
      build.swift = 2
      build.vitality = 3
      build.flare = 2
      build.bell = 1
      build.wide = 2
      player.hp = player.maxHp
      player.invuln = 0
    },
    lowpassHz: () => audio.lowpassHz(),
    pinWater: (which: number | string) => {
      if (!cloister) return
      const c = typeof which === 'number' ? which : (waterCode(which) ?? 17)
      cloister.hold(sun, c)
      cloister.tick(0, sun, build.wide, player.x, player.z)
      writeFloorPillars(floor.uniforms.uPillars.value, floor.uniforms.uPillarN)
    },
    cloisterCover: () => (activeMap === 'cloister' && cloister ? cloister.cover() : null),
    benchLit: () => (cloister ? cloister.benchLit() : null),
    cloisterTris: () => (cloister ? cloister.tris() : null),
    muteHints: () => {
      hintBits = 3
      storageSet('noonsworn.cloister.hints', '3')
    },
    cloisterAgree: (points: { x: number; z: number }[]) => {
      if (activeMap !== 'cloister' || !cloister) return { tested: 0, agree: 0 }
      cloister.tick(0, sun, build.wide, player.x, player.z)
      sun.pushUniforms(floor.uniforms, quality.tier !== 'low')
      writeFloorPillars(floor.uniforms.uPillars.value, floor.uniforms.uPillarN)
      return cloister.agree(gpu.renderer, follow.camera, points, [playerView, horde.miteMesh, horde.houndMesh, horde.darterMesh, scatter])
    },
    coinTest: (points: { x: number; z: number }[]) => {
      if (activeMap !== 'lattice' || !lattice) return { tested: 0, agree: 0 }
      lattice.tick(0, sun, time, player.x, player.z, sunLit)
      sun.pushUniforms(floor.uniforms, quality.tier !== 'low')
      writeFloorPillars(floor.uniforms.uPillars.value, floor.uniforms.uPillarN)
      return lattice.agree(gpu.renderer, follow.camera, points, [playerView, horde.miteMesh, horde.houndMesh, horde.darterMesh, scatter], sunLit)
    },
    offers: () => {
      const buf: Card[] = []
      const n = rollCards(build, rng, buf, 4)
      return buf.slice(0, n).map((c) => c.name)
    },
  }
  window.__noonsworn = api
}
