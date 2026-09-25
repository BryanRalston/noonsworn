import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
} from 'three'
import { mountPalette, COLOR } from '../data/palette'
import { TUNING, type TierName } from '../data/tuning'
import { createEvents } from '../core/events'
import { startLoop } from '../core/loop'
import { mulberry32, type Rng } from '../core/rng'
import { NoopAds } from '../platform/ads'
import { createFollowCamera } from '../render/camera'
import { createFloorMaterial } from '../render/floorShader'
import { enemyTime } from '../render/instancing'
import { createQuality, wantsAntialias } from '../render/quality'
import { createGpu } from '../render/renderer'
import { createInput, type InputState } from '../input/input'
import type { Basis } from '../input/touch'
import { createDebugOverlay, frameSummary, pushFrameSample } from '../ui/debugOverlay'
import { createFeatureMap } from '../ui/featureMap'
import { createHud } from '../ui/hud'
import { createLevelUp } from '../ui/levelUp'
import { createScreens, type ScreenMode } from '../ui/screens'
import { createSundial } from '../ui/sundialHud'
import { createFloats } from '../ui/floats'
import { createAudio } from '../audio/audio'
import { loadArt } from '../render/art'
import { createBloom } from '../render/bloom'
import { toonMap } from '../render/toon'
import { storageGet, storageSet } from '../platform/storage'
import { createTouchControls } from '../ui/touchControls'
import { createSela } from './actors'
import { buildInlay, buildPillars, buildRubble, buildWalls, buildWallTrim } from './arena'
import { createShards } from './shards'
import { createBlobShadows } from './shadows'
import { createDirector } from './director'
import { createHorde, type HordeCtx } from './enemies/horde'
import { CARD, createBuild, describe, grantXp, rollCards, xpToNext, type Build, type Card } from './leveling'
import { createCut, createRibbon, resetCut, sweepCut, syncRibbon, updateCut } from './noonCut'
import { createPickups } from './pickups'
import { createPlayer, hurtPlayer, integratePlayer, resetPlayer } from './player'
import { createSunClock, damageAmount } from './sunClock'
import { createHalo } from './weapons/halo'
import { createSunspear } from './weapons/sunspear'

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
  }
}

export function boot(container: HTMLElement) {
  mountPalette(document.documentElement)
  const params = new URLSearchParams(location.search)
  const forced = params.get('seed')
  const forcedSeed = forced != null && Number.isFinite(Number(forced)) ? Number(forced) : null
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
  const featureMap = createFeatureMap(() => ({ version: __VERSION__, sha: __SHA__, tier: quality.tier }))
  ui.append(featureMap.root)
  const debug = createDebugOverlay(ui)
  const touchView = createTouchControls(container)
  const basis: Basis = { fx: 0, fz: -1, rx: 1, rz: 0 }
  const input = createInput(canvas, touchView, () => basis)
  const floor = createFloorMaterial()
  const floorMesh = new Mesh(new PlaneGeometry(TUNING.arena.size, TUNING.arena.size).rotateX(-Math.PI / 2), floor.material)
  floorMesh.position.y = 0
  const dither = `
float viewN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
gl_FragColor.rgb += (viewN - 0.5) * 0.055;`
  const addDither = (material: MeshToonMaterial) => {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>\n${dither}`)
    }
  }
  const wallMat = new MeshToonMaterial({ color: COLOR.sandstone, gradientMap: toonMap() })
  const trimMat = new MeshToonMaterial({ color: COLOR.sandstoneDeep, gradientMap: toonMap() })
  const pillarMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true })
  addDither(wallMat)
  addDither(trimMat)
  addDither(pillarMat)
  const outerMat = new MeshToonMaterial({ color: COLOR.sandstoneMid, gradientMap: toonMap() })
  outerMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDune;')
      .replace('#include <project_vertex>', 'vDune = (modelMatrix * vec4(transformed, 1.0)).xz;\n#include <project_vertex>')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDune;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float dune = sin(vDune.x * 0.05) * sin(vDune.y * 0.041);
diffuseColor.rgb *= vec3(0.86, 0.8, 0.7);
diffuseColor.rgb *= 0.9 + 0.16 * (dune * 0.5 + 0.5);`,
      )
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n${dither}`)
  }
  const skyMat = new MeshBasicMaterial({ color: 0xffffff, side: BackSide, depthWrite: false, fog: false })
  skyMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>\n${dither}`)
  }
  const inlayMat = new MeshBasicMaterial({
    color: COLOR.sandstone,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  inlayMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>\n${dither}`)
  }
  const walls = new Mesh(buildWalls(), wallMat)
  const trim = new Mesh(buildWallTrim(), trimMat)
  const pillars = new Mesh(buildPillars(), pillarMat)
  const inlay = new Mesh(buildInlay(), inlayMat)
  inlay.renderOrder = 1
  const outer = new Mesh(new PlaneGeometry(900, 900).rotateX(-Math.PI / 2), outerMat)
  outer.position.y = -0.05
  const skyHeight = 140
  const skyHorizonV = 0.36
  const sky = new Mesh(new CylinderGeometry(110, 110, skyHeight, 36, 1, true), skyMat)
  const skyCap = new Mesh(new SphereGeometry(110, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), skyMat)
  sky.add(skyCap)
  skyCap.position.y = skyHeight * 0.5 - 8
  sky.renderOrder = -2
  const rubble = new Mesh(buildRubble(), trimMat)
  const flareRing = new Mesh(
    new RingGeometry(0.85, 1.05, 40),
    new MeshBasicMaterial({ color: COLOR.goldHot, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, side: DoubleSide }),
  )
  flareRing.rotation.x = -Math.PI / 2
  flareRing.visible = false
  const bellRing = new Mesh(
    new RingGeometry(0.9, 1.15, 40),
    new MeshBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.65, depthWrite: false, toneMapped: false, side: DoubleSide }),
  )
  bellRing.rotation.x = -Math.PI / 2
  bellRing.visible = false
  const sela = createSela()
  const playerView = sela.root
  const ribbon = createRibbon()
  const marker = new Mesh(new CircleGeometry(2.4, 24), new MeshBasicMaterial({ color: COLOR.goldHot, side: DoubleSide, toneMapped: false }))
  const pointer = new Mesh(new BoxGeometry(0.18, 0.06, 2.4), new MeshBasicMaterial({ color: COLOR.goldHot, toneMapped: false }))
  pointer.position.y = 0.08
  const shadows = createBlobShadows()
  const shards = createShards()
  const bloom = createBloom()
  gpu.scene.add(sky, outer, rubble, floorMesh, walls, trim, pillars, inlay, shadows.mesh, playerView, ribbon, marker, pointer, shards.mesh, flareRing, bellRing)

  const sun = createSunClock()
  const horde = createHorde()
  const spears = createSunspear()
  const halo = createHalo()
  const pickups = createPickups()
  const director = createDirector()
  gpu.scene.add(horde.miteMesh, horde.houndMesh, horde.teleMesh, spears.mesh, halo.mesh, pickups.mesh)

  const bus = createEvents()
  const player = createPlayer()
  const cut = createCut()
  let build: Build = createBuild()
  let rng: Rng = mulberry32(forcedSeed ?? (Date.now() >>> 0))
  let mode: ScreenMode = 'title'
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
  let queuedCut = false
  const frame = blankInput()
  const held = blankInput()
  const shown: Card[] = [describe(build, CARD.heal), describe(build, CARD.heal), describe(build, CARD.heal)]
  let debugClock = 0
  let stats = { calls: 0, triangles: 0, geometries: 0, textures: 0 }
  const audit =
    damageAmount(10, true, 'weapon', 0) === 20 &&
    damageAmount(10, false, 'weapon', 0) === 5 &&
    damageAmount(45, false, 'cut', 0) === 45 &&
    damageAmount(45, true, 'cut', 0) === 90

  const floats = createFloats(container, TUNING.tiers.high.floats)
  const audio = createAudio(() => fxRng())
  const toast = document.createElement('div')
  toast.id = 'toast'
  toast.hidden = true
  container.append(toast)
  let exposePops = 0
  let toastTimer = 0
  let xpStep = 0
  let cutWas = false
  let litBurst = 0
  let litBurstAt = 0
  let flareCd = 6
  let bellCd = 10
  let flareShow = 0
  let bellShow = 0
  let flareR = 3.5
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
    isLit: (x, z) => sun.isLit(x, z),
    onHit(x, z, amount, lit, killed, index) {
      audio.hit()
      if (lit) {
        floats.push(x, z, `${Math.round(amount)}`, 'hot')
        audio.exposed()
      } else {
        audio.armored()
        if (time - (armFloatAt[index] ?? 0) >= 0.15) {
          armFloatAt[index] = time
          floats.push(x, z, '', 'spark')
        }
      }
      sela.swing(time)
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
    },
    onKill() {
      kills++
    },
    onEmber(x, z) {
      shards.burst(x, z, true)
    },
    onDeath(x, z, lit) {
      shards.burst(x, z, lit)
    },
  }

  function buzz(ms: number) {
    if (storageGet('noonsworn.haptics') === '0') return
    const nav = navigator as Navigator & { vibrate?: (pattern: number) => boolean }
    if (typeof nav.vibrate === 'function') nav.vibrate(ms)
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
    horde.cullTo(quality.cap, player.x, player.z)
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
    if (next === 'dead') {
      endAt = performance.now()
      audio.death()
    } else if (next === 'clear') {
      endAt = performance.now()
      audio.win()
    }
    if (next !== 'level') levelUp.hide()
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
  }

  function openLevel() {
    rollCards(build, rng, shown)
    levelUp.show(shown)
    audio.level()
    buzz(30)
    showMode('level')
    ads.gameplayStop()
  }

  function applyCard(id: number) {
    if (id === CARD.spear && build.spear < 5) build.spear++
    else if (id === CARD.halo && build.halo < 5) build.halo++
    else if (id === CARD.might && build.might < 5) build.might++
    else if (id === CARD.haste && build.haste < 5) build.haste++
    else if (id === CARD.swift && build.swift < 5) build.swift++
    else if (id === CARD.lodestone && build.lodestone < 5) build.lodestone++
    else if (id === CARD.vitality && build.vitality < 5) {
      build.vitality++
      player.maxHp += TUNING.passive.vitalHp
      player.hp = Math.min(player.maxHp, player.hp + TUNING.passive.vitalHeal)
    } else if (id === CARD.wide && build.wide < TUNING.wideMax) {
      build.wide++
      sun.setWide(build.wide)
    } else if (id === CARD.flare && build.flare < TUNING.passive.max) build.flare++
    else if (id === CARD.bell && build.bell < TUNING.passive.max) build.bell++
    else if (id === CARD.longday && build.longday < TUNING.passive.max) build.longday++
    else if (id === CARD.searing && build.searing < TUNING.passive.max) build.searing++
    else {
      player.hp = Math.min(player.maxHp, player.hp + TUNING.healCard)
    }
    build.pending = Math.max(0, build.pending - 1)
    if (build.pending > 0) openLevel()
    else {
      levelUp.hide()
      showMode('playing')
      ads.gameplayStart()
    }
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

  function showToast(text: string) {
    toast.textContent = text
    toast.hidden = false
    toastTimer = 3.2
  }

  function startRun() {
    rng = mulberry32(forcedSeed ?? (Date.now() >>> 0))
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
    time = 0
    kills = 0
    tick = 0
    hitStop = 0
    shakeT = 0
    follow.snap(0, 0)
    exposePops = 0
    flareCd = 6
    bellCd = 10
    audio.startMusic()
    const seen = Number(storageGet('noonsworn.runs') ?? '0')
    if (seen < 2) {
      showToast(seen === 0 ? 'Fight in the SUN — enemies take ×2' : 'Space / Cut button to dash-slash')
      storageSet('noonsworn.runs', String(seen + 1))
    }
    levelUp.hide()
    featureMap.close()
    showMode('playing')
    ads.gameplayStart()
    swallow = true
  }

  function spawnStress(n: number) {
    if (mode !== 'playing' && mode !== 'paused') startRun()
    for (let i = 0; i < n; i++) {
      const ang = rng() * Math.PI * 2
      const dist = 16 + rng() * 6
      horde.spawn(0, player.x + Math.cos(ang) * dist, player.z + Math.sin(ang) * dist, false, quality.cap, player.x, player.z)
    }
  }

  spears.onFire = () => audio.spear()
  screens.onPlay = () => {
    audio.ui()
    startRun()
  }
  screens.onRestart = () => {
    audio.ui()
    startRun()
  }
  screens.onResume = () => {
    if (mode === 'paused') {
      showMode('playing')
      ads.gameplayStart()
    }
  }
  screens.onFeature = () => featureMap.toggle()
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
    const title = document.querySelector('#title-screen') as HTMLElement | null
    if (title && slots.keyart) {
      title.style.backgroundImage = `url(${base}assets/art/${slots.keyart})`
      title.style.backgroundSize = 'cover'
      title.style.backgroundPosition = 'center'
    }
    const heading = document.querySelector('#title-screen h1')
    if (heading && slots.logo) {
      heading.textContent = ''
      const img = document.createElement('img')
      img.src = `${base}assets/art/${slots.logo}`
      img.alt = 'NOONSWORN'
      img.style.width = 'min(420px, 86vw)'
      img.style.height = 'auto'
      heading.append(img)
    }
  }))
  if (params.get('debug') === '1') debug.open()

  window.addEventListener('keydown', (e) => {
    if (e.repeat || mode !== 'title') return
    if (e.code === 'KeyM' || e.code === 'F3' || e.code === 'Backquote') return
    audio.unlock()
    audio.ui()
    startRun()
    input.clearCut()
  })
  window.addEventListener('pointerdown', (e) => {
    const target = e.target
    if (!(target instanceof Element)) return
    if (target.closest('button, label, input, #feature-map, #debug, #level-up')) return
    if ((mode === 'dead' || mode === 'clear') && performance.now() - endAt < 800) return
    if (mode === 'title' || mode === 'dead' || mode === 'clear') {
      audio.unlock()
      audio.ui()
      startRun()
      input.clearCut()
    }
  })
  window.addEventListener('pointerdown', () => audio.unlock())
  window.addEventListener('keydown', () => audio.unlock())
  document.addEventListener('visibilitychange', () => {
    audio.setMuted(document.hidden || storageGet('noonsworn.mute') === '1')
    if (document.hidden && mode === 'playing') {
      showMode('paused')
      ads.gameplayStop()
    }
  })
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault()
  }, { passive: false })

  startLoop({
    beginFrame(frameSec) {
      follow.basis(basis)
      input.readInto(frame, follow.camera)
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
      if (frame.featureToggle) featureMap.toggle()
      if (frame.usingTouch) touchView.show()
      else touchView.hide()
      hud.setTouchMode(touchView.visible)
      if (mode === 'level' && frame.pick >= 0) applyCard(shown[frame.pick]?.id ?? CARD.heal)
      if ((mode === 'dead' || mode === 'clear') && frame.restartPressed) startRun()
      if (frame.pausePressed) {
        if (mode === 'playing') {
          showMode('paused')
          ads.gameplayStop()
        } else if (mode === 'paused') {
          showMode('playing')
          ads.gameplayStart()
        }
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
      return mode === 'playing'
    },
    step(dt, first) {
      const state = first ? frame : held
      if (time >= TUNING.runLength) {
        showMode('clear')
        bus.emit('runEnd', { victory: true, time, kills, level: build.level })
        return false
      }
      sun.timeScale = Math.max(0.4, 1 - 0.12 * build.longday)
      if (!sun.frozen) sun.advance(dt)
      if (build.flare > 0) {
        flareCd -= dt
        if (flareCd <= 0) {
          flareCd = 6
          const radius = 3.5 + (build.flare - 1)
          horde.radial(player.x, player.z, radius, 16, ctx)
          flareR = radius
          flareShow = 0.4
        }
      }
      if (build.bell > 0) {
        bellCd -= dt
        if (bellCd <= 0) {
          bellCd = 10
          horde.slow(player.x, player.z, 5, 1.2)
          audio.bell()
          bellShow = 0.45
        }
      }
      time += dt
      const wishX = basis.rx * state.moveX + basis.fx * state.moveY
      const wishZ = basis.rz * state.moveX + basis.fz * state.moveY
      const speed = TUNING.player.speed * (1 + TUNING.passive.swift * build.swift)
      fillCtx(dt)
      updateCut(cut, player, dt, {
        pressed: state.cutPressed,
        dirX: state.cutDirX,
        dirZ: state.cutDirZ,
        wishX,
        wishZ,
        aimX: state.aimX,
        aimZ: state.aimZ,
        mouseIdle: state.mouseIdle,
        usingTouch: state.usingTouch,
      }, build.haste)
      integratePlayer(player, dt, wishX, wishZ, speed, cut.active, cut.dirX, cut.dirZ, cut.time)
      if (cut.active && !cutWas) {
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
          hitStop = Math.max(hitStop, TUNING.cut.hitStop)
          shakeAmp = TUNING.cut.shake
          shakeT = TUNING.shakeDecay
        })
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
      director.update(dt, time, horde, player.x, player.z, quality.cap, rng, cam.x, cam.z)
      horde.update(ctx)
      spears.update(dt, player.x, player.z, horde, build.spear, build.haste, build.might, TUNING.tiers[quality.tier].projectiles, ctx)
      halo.update(dt, player.x, player.z, horde, build.halo, build.might, time, ctx)
      const before = build.pending
      pickups.update(dt, player.x, player.z, TUNING.player.pickup * (1 + TUNING.passive.lode * build.lodestone), TUNING.tiers[quality.tier].xp, (value) => {
        xpWindow += value
        xpStep = (xpStep + 1) % 8
        audio.xp(xpStep)
        grantXp(build, value)
      })
      if (player.hp <= 0) {
        showMode('dead')
        bus.emit('runEnd', { victory: false, time, kills, level: build.level })
        return false
      }
      if (time >= TUNING.runLength) {
        showMode('clear')
        bus.emit('runEnd', { victory: true, time, kills, level: build.level })
        return false
      }
      if (build.pending > before) {
        openLevel()
        return false
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
      const mx = (sun.x / len) * TUNING.arena.markerRadius
      const mz = (sun.z / len) * TUNING.arena.markerRadius
      marker.position.set(mx, TUNING.arena.markerHeight + 8, mz)
      marker.quaternion.copy(follow.camera.quaternion)
      pointer.position.set((sun.x / len) * 22, 0.08, (sun.z / len) * 22)
      pointer.rotation.y = Math.atan2(-sun.x, -sun.z)
      sun.pushUniforms(floor.uniforms, quality.tier !== 'low')
      enemyTime().value = performance.now() * 0.001
      if (!document.hidden) audio.setMuted(storageGet('noonsworn.mute') === '1')
      audio.setMusic(Number(storageGet('noonsworn.music') ?? '45') / 100)
      audio.setSfx(Number(storageGet('noonsworn.sfx') ?? '90') / 100)
      playerView.position.set(x, 0, z)
      playerView.rotation.y = yaw
      sela.bob(performance.now() * 0.001, Math.hypot(player.vx, player.vz), cut.active || cut.fade > 0 ? 1 : 0)
      playerView.visible = player.hp > 0 && (player.invuln <= 0 || ((player.invuln * 14) | 0) % 2 === 0)
      sela.halo.visible = playerView.visible
      syncRibbon(ribbon, cut, player)
      horde.sync()
      spears.sync()
      halo.sync(x, z, build.halo)
      pickups.sync()
      shards.update(frameSec)
      shadows.begin()
      shadows.put(x, z, 1.5)
      horde.visit((ex, ez, kind) => shadows.put(ex, ez, kind === 0 ? 1.5 : 2.2))
      pickups.visit((gx, gz) => shadows.put(gx, gz, 0.6))
      sela.placeHalo(follow.camera, x, z)
      if (flareShow > 0) {
        flareShow = Math.max(0, flareShow - frameSec)
        const k = 1 - flareShow / 0.4
        flareRing.visible = flareShow > 0
        flareRing.position.set(x, 0.08, z)
        flareRing.scale.setScalar(Math.max(0.2, flareR * k))
        ;(flareRing.material as MeshBasicMaterial).opacity = 0.75 * (1 - k)
      } else flareRing.visible = false
      if (bellShow > 0) {
        bellShow = Math.max(0, bellShow - frameSec)
        const k = 1 - bellShow / 0.45
        bellRing.visible = bellShow > 0
        bellRing.position.set(x, 0.1, z)
        bellRing.scale.setScalar(Math.max(0.2, 5 * k))
        ;(bellRing.material as MeshBasicMaterial).opacity = 0.7 * (1 - k)
      } else bellRing.visible = false
      shadows.end()
      sky.position.y = follow.camera.position.y + skyHeight * (0.5 - skyHorizonV)
      if (quality.tier === 'low') gpu.renderer.render(gpu.scene, follow.camera)
      else bloom.render(gpu.renderer, gpu.scene, follow.camera)
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
      const ready = cut.cooldown <= 0 ? 1 : 1 - cut.cooldown / (TUNING.cut.cooldown * Math.max(0.2, 1 - TUNING.passive.haste * build.haste))
      hud.setHp(player.hp, player.maxHp)
      hud.setXp(build.xp, xpToNext(build.level), build.level)
      hud.setKills(kills)
      hud.setCooldown(ready)
      touchView.setCooldown(ready)
      sundial.set(sun.angle, mode === 'title' ? sun.time : time)
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
            extra: `${sun.frozen ? 'frozen' : 'moving'}  player ${sun.isLit(player.x, player.z) ? 'lit' : 'shade'}  xp/s ${xpPerSec.toFixed(1)}  vsync ${quality.targetMs.toFixed(2)}  peak ${heard.peak.toFixed(1)}dB  voices ${heard.voices}  clip ${heard.clipped}  ads ${document.documentElement.dataset.ads ?? ads.last}  audit ${audit ? 'ok' : 'fail'}\nsfx ${sfxLine()}\ntris mite ${horde.tris.mite.toFixed(0)} hound ${horde.tris.hound.toFixed(0)} sela ${sela.tris.toFixed(0)}`,
          })
        }
      }
    },
  })

  function sfxLine(): string {
    const c = audio.counts()
    return Object.keys(c)
      .map((key) => `${key}:${c[key] ?? 0}`)
      .join(' ')
  }

  const api = {
    startRun,
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
    audioCounts: () => audio.counts(),
    time: () => time,
    mode: () => mode,
  }
  window.__noonsworn = api
}
