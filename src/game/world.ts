import { BoxGeometry, CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
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
import { storageGet, storageSet } from '../platform/storage'
import { createTouchControls } from '../ui/touchControls'
import { buildTemple } from './arena'
import { createDirector } from './director'
import { createHorde, type HordeCtx } from './enemies/horde'
import { CARD, createBuild, describe, grantXp, rollCards, xpToNext, type Build, type Card } from './leveling'
import { createCut, createRibbon, resetCut, sweepCut, syncRibbon, updateCut } from './noonCut'
import { createPickups } from './pickups'
import { createPlayer, createPlayerView, hurtPlayer, integratePlayer, resetPlayer } from './player'
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
  const temple = new Mesh(buildTemple(), new MeshBasicMaterial({ vertexColors: true }))
  const playerView = createPlayerView()
  const ribbon = createRibbon()
  const marker = new Mesh(new CircleGeometry(2.4, 24), new MeshBasicMaterial({ color: COLOR.goldHot, side: DoubleSide }))
  const pointer = new Mesh(new BoxGeometry(0.18, 0.06, 2.4), new MeshBasicMaterial({ color: COLOR.goldHot }))
  pointer.position.y = 0.08
  gpu.scene.add(floorMesh, temple, playerView, ribbon, marker, pointer)

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
    isLit: (x, z) => sun.isLit(x, z),
    onHit(x, z, amount, lit, killed) {
      const text = lit ? `${Math.round(amount)}` : `${Math.round(amount)} shield`
      floats.push(x, z, text, lit ? 'hot' : 'arm')
      if (lit) audio.exposed()
      else audio.armored()
      if (killed && lit) {
        audio.kill()
        shakeAmp = Math.max(shakeAmp, 0.03)
        shakeT = Math.max(shakeT, 0.12)
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
      if (time < TUNING.openSeconds) player.invuln = TUNING.openInvuln
      shakeAmp = TUNING.hurtShake
      shakeT = TUNING.shakeDecay
      audio.hurt()
      bus.emit('hurt', { amount })
    },
    onXp(x, z, value) {
      pickups.spawn(x, z, value, TUNING.tiers[quality.tier].xp, player.x, player.z)
    },
    onKill() {
      kills++
    },
  }

  function endDetail() {
    const whole = Math.max(0, Math.floor(time))
    const m = Math.floor(whole / 60)
    const s = whole % 60
    return `${m}:${s < 10 ? '0' : ''}${s}   ${kills} kills   level ${build.level}`
  }

  function applyPresentation() {
    gpu.resize(quality.ratio)
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
    if (next === 'dead' || next === 'clear') endAt = performance.now()
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
  }

  function openLevel() {
    rollCards(build, rng, shown)
    levelUp.show(shown)
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
    } else {
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

  screens.onPlay = () => startRun()
  screens.onRestart = () => startRun()
  screens.onResume = () => {
    if (mode === 'paused') {
      showMode('playing')
      ads.gameplayStart()
    }
  }
  screens.onFeature = () => featureMap.toggle()
  hud.onPause = () => {
    if (mode === 'playing') {
      showMode('paused')
      ads.gameplayStop()
    } else if (mode === 'paused') {
      showMode('playing')
      ads.gameplayStart()
    }
  }
  levelUp.onPick = (index) => {
    if (mode === 'level') applyCard(shown[index]?.id ?? CARD.heal)
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
  requestAnimationFrame(() => loadArt(floor.uniforms, () => {}))
  if (params.get('debug') === '1') debug.open()

  window.addEventListener('keydown', (e) => {
    if (e.repeat || mode !== 'title') return
    if (e.code === 'KeyM' || e.code === 'F3' || e.code === 'Backquote') return
    startRun()
    input.clearCut()
  })
  window.addEventListener('pointerdown', (e) => {
    const target = e.target
    if (!(target instanceof Element)) return
    if (target.closest('button, #feature-map, #debug, #level-up')) return
    if ((mode === 'dead' || mode === 'clear') && performance.now() - endAt < 800) return
    if (mode === 'title' || mode === 'dead' || mode === 'clear') {
      startRun()
      input.clearCut()
    }
  })
  window.addEventListener('pointerdown', () => audio.unlock())
  window.addEventListener('keydown', () => audio.unlock())
  document.addEventListener('visibilitychange', () => {
    audio.setMuted(document.hidden)
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
      if (mode === 'title' && !sun.frozen) sun.advance(frameSec)
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
      if (!sun.frozen) sun.advance(dt)
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
        const k = Math.max(0, shakeT / TUNING.shakeDecay)
        const amp = shakeAmp * k
        const now = performance.now() * 0.001
        sx = Math.sin(now * 70) * amp
        sz = Math.cos(now * 54) * amp
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
      playerView.position.set(x, 0, z)
      playerView.rotation.y = yaw
      playerView.visible = player.hp > 0 && (player.invuln <= 0 || ((player.invuln * 14) | 0) % 2 === 0)
      syncRibbon(ribbon, cut, player)
      horde.sync()
      spears.sync()
      halo.sync(x, z, build.halo)
      pickups.sync()
      gpu.renderer.render(gpu.scene, follow.camera)
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
          debug.setText({
            fps: summary.fps,
            avg: summary.avg,
            low: summary.low,
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
            extra: `${sun.frozen ? 'frozen' : 'moving'}  player ${sun.isLit(player.x, player.z) ? 'lit' : 'shade'}  xp/s ${xpPerSec.toFixed(1)}  ads ${document.documentElement.dataset.ads ?? ads.last}  audit ${audit ? 'ok' : 'fail'}`,
          })
        }
      }
    },
  })

  const api = {
    startRun,
    spawnStress,
    sun,
    player,
    horde,
    build: () => build,
    stats: () => stats,
    damageAmount,
  }
  window.__noonsworn = api
}
