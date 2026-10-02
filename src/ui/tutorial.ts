import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, type Camera, type Scene, Vector3 } from 'three'
import { storageGet, storageSet } from '../platform/storage'

const KEY = 'noonsworn.tut.v1'

export interface Tutorial {
  mesh: Mesh
  begin: (enabled: boolean) => void
  reset: () => void
  setEnabled: (on: boolean) => void
  update: (
    dt: number,
    x: number,
    z: number,
    camera: Camera,
    width: number,
    height: number,
    now: { moving: boolean; litNear: boolean; inLight: boolean; device: string; charges: number },
  ) => void
  onKill: () => void
  onShard: () => void
  onCollect: () => void
  onCut: () => void
  onCharge: () => void
  onClaim: () => void
  outlining: () => boolean
  active: () => boolean
  conceal: () => void
}

export function createTutorial(parent: HTMLElement, scene: Scene): Tutorial {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const tex = new CanvasTexture(canvas)
  tex.anisotropy = 2
  const mesh = new Mesh(
    new PlaneGeometry(4.8, 4.8).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }),
  )
  mesh.position.y = 0.2
  mesh.renderOrder = 8
  mesh.frustumCulled = false
  mesh.visible = false
  scene.add(mesh)
  const label = document.createElement('div')
  label.id = 'coach'
  label.hidden = true
  parent.append(label)
  const arrow = document.createElement('div')
  arrow.id = 'coach-arrow'
  arrow.hidden = true
  parent.append(arrow)
  const v = new Vector3()
  // Marker ring is CircleGeometry radius 0.8. Sample past it, and above the body and spear.
  const RING_CLEAR = 1.35
  let step = readStep()
  let timer = 0
  let enabled = false
  let moved = false
  let killed = false
  let shard = false
  let collected = false
  let cut = false
  let charged = false
  let claimed = false
  let outline = 0
  let outlined = false
  let litHold = 0
  let drawn = -1
  let drawnDevice = ''

  function save() {
    storageSet(KEY, step >= 6 ? 'done' : String(step))
  }
  function hideArrow() {
    arrow.hidden = true
  }
  function hide() {
    mesh.visible = false
    label.hidden = true
    hideArrow()
  }
  function advance() {
    step++
    timer = 0
    litHold = 0
    if (step === 1) {
      moved = false
      killed = false
    }
    if (step === 2) outlined = false
    if (step === 3) cut = false
    if (step === 4) collected = false
    if (step === 5) claimed = false
    save()
  }
  function done(): boolean {
    if (timer < 3) return false
    if (step === 0) return moved
    if (step === 1) return killed
    if (step === 2) return litHold >= 1.5
    if (step === 3) return cut
    if (step === 4) return collected && shard
    if (step === 5) return claimed
    return false
  }
  function line(device: string): string {
    if (step === 0) {
      if (device === 'touch') return 'Drag to move'
      if (device === 'pad') return 'Left stick to move'
      return 'WASD to move'
    }
    if (step === 1) return 'Your weapons fire on their own'
    if (step === 2) return 'Enemies in sunlight take double damage. Fight in the light.'
    if (step === 3) {
      if (device === 'touch') return 'Dash-slash through them. Tap Cut.'
      if (device === 'pad') return 'Dash-slash through them. Press A.'
      return 'Dash-slash through them. Press Space.'
    }
    if (step === 4) return 'Collect shards'
    if (device === 'touch') return 'Power-up ready. Tap the halo.'
    if (device === 'pad') return 'Power-up ready. Press LB.'
    return 'Power-up ready. Press Tab.'
  }
  function screenTop(wx: number, wy: number, wz: number, camera: Camera, height: number, topY: number): number {
    v.set(wx, wy, wz).project(camera)
    const sy = (-v.y * 0.5 + 0.5) * height
    return sy < topY ? sy : topY
  }
  function placeLabel(x: number, z: number, camera: Camera, width: number, height: number): { x: number; y: number } {
    const c = RING_CLEAR
    const d = c * 0.7
    let topY = screenTop(x, 2.4, z, camera, height, 1e9)
    topY = screenTop(x + c, 0, z, camera, height, topY)
    topY = screenTop(x - c, 0, z, camera, height, topY)
    topY = screenTop(x, 0, z + c, camera, height, topY)
    topY = screenTop(x, 0, z - c, camera, height, topY)
    topY = screenTop(x + d, 0, z + d, camera, height, topY)
    topY = screenTop(x - d, 0, z + d, camera, height, topY)
    topY = screenTop(x + d, 0, z - d, camera, height, topY)
    topY = screenTop(x - d, 0, z - d, camera, height, topY)
    v.set(x, 0, z).project(camera)
    let left = (v.x * 0.5 + 0.5) * width
    const labelH = Math.max(36, label.offsetHeight)
    const labelW = Math.max(120, label.offsetWidth)
    let top = topY - 36 - labelH
    if (!Number.isFinite(top) || top < height * 0.12) {
      top = height * 0.64
      left = width * 0.5
    }
    const half = labelW * 0.5
    const portrait = height > width
    const cut = document.getElementById('btn-cut')
    const touchOn = document.getElementById('touch-root')?.classList.contains('touch-off') === false
    if (cut && (portrait || touchOn)) {
      const r = cut.getBoundingClientRect()
      const reserveL = r.width > 0 ? r.left - 16 : width - 130
      const reserveT = r.height > 0 ? r.top - 16 : height - 150
      const overlaps = left + half > reserveL && left - half < (r.width > 0 ? r.right + 16 : width) && top + labelH > reserveT
      if (overlaps) {
        const above = reserveT - labelH
        if (above >= height * 0.45) top = above
        else left = Math.min(left, reserveL - half)
      }
    }
    if (left - half < 8) left = half + 8
    if (left + half > width - 8) left = width - 8 - half
    if (top < 8) top = 8
    if (top + labelH > height - 8) top = Math.max(8, height - 8 - labelH)
    return { x: left, y: top }
  }
  function aimArrow() {
    const halo = document.querySelector('#btn-halo')
    if (!(halo instanceof HTMLElement) || timer > 2.4) {
      hideArrow()
      return
    }
    const from = label.getBoundingClientRect()
    const to = halo.getBoundingClientRect()
    const x1 = from.left + from.width / 2
    const y1 = from.top + from.height / 2
    const x2 = to.left + to.width / 2
    const y2 = to.top + to.height / 2
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (len < 8) {
      hideArrow()
      return
    }
    arrow.hidden = false
    arrow.style.left = `${x1}px`
    arrow.style.top = `${y1}px`
    arrow.style.width = `${Math.max(0, len - 28)}px`
    arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
  }

  const api: Tutorial = {
    mesh,
    begin(on) {
      enabled = on
      step = readStep()
      timer = 0
      outline = 0
      outlined = false
      litHold = 0
      moved = false
      killed = false
      collected = false
      cut = false
      claimed = false
      if (!on || step >= 6) hide()
    },
    reset() {
      step = 0
      timer = 0
      outline = 0
      outlined = false
      litHold = 0
      moved = false
      killed = false
      shard = false
      collected = false
      cut = false
      charged = false
      claimed = false
      save()
    },
    setEnabled(on) {
      enabled = on
      if (!on) hide()
    },
    conceal() {
      hide()
    },
    onKill() {
      killed = true
    },
    onShard() {
      shard = true
    },
    onCollect() {
      collected = true
    },
    onCut() {
      if (step === 3 && timer >= 1) cut = true
    },
    onCharge() {
      charged = true
    },
    onClaim() {
      claimed = true
    },
    outlining() {
      return outline > 0
    },
    active() {
      return enabled && step < 6
    },
    update(dt, x, z, camera, width, height, now) {
      if (!enabled || step >= 6) {
        hide()
        return
      }
      label.classList.toggle('big', now.device === 'touch' || height > width)
      if (step === 5 && charged && now.charges <= 0) {
        step = 6
        hide()
        save()
        return
      }
      if (now.moving) moved = true
      if (step === 5 && !charged) {
        hide()
        timer = 0
        litHold = 0
        return
      }
      if (step === 2 && timer >= 3) litHold = now.inLight ? litHold + dt : 0
      timer += dt
      if (timer >= 12 || done()) advance()
      if (step >= 6) {
        hide()
        save()
        return
      }
      if (step === 5 && !charged) {
        hide()
        timer = 0
        return
      }
      if (step === 5 && now.charges <= 0) {
        step = 6
        hide()
        save()
        return
      }
      if (step === 2 && !outlined && (now.litNear || timer > 0.2)) {
        outlined = true
        outline = 1.6
      }
      if (outline > 0) outline = Math.max(0, outline - dt)
      if (drawn !== step || drawnDevice !== now.device) {
        drawn = step
        drawnDevice = now.device
        paintGlyph(canvas, step)
        tex.needsUpdate = true
      }
      // The floor glyph is 4.8 m across and sat on the 0.8 m player ring. The label is the hint.
      mesh.visible = false
      label.hidden = false
      label.textContent = line(now.device)
      const placed = placeLabel(x, z, camera, width, height)
      label.style.transform = `translate(${placed.x}px, ${placed.y}px) translate(-50%, 0)`
      if (step === 5 && now.charges > 0) aimArrow()
      else hideArrow()
    },
  }
  return api
}

function readStep(): number {
  const raw = storageGet(KEY)
  if (raw === 'done') return 6
  const n = Number(raw ?? '0')
  return Number.isFinite(n) ? Math.max(0, Math.min(6, n)) : 0
}

function paintGlyph(canvas: HTMLCanvasElement, step: number) {
  const g = canvas.getContext('2d')
  if (!g) return
  g.clearRect(0, 0, 256, 256)
  g.fillStyle = 'rgba(20, 18, 37, 0.72)'
  g.beginPath()
  g.arc(128, 128, 118, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#F2B632'
  g.lineWidth = 18
  g.stroke()
  g.strokeStyle = '#FFF3B0'
  g.lineWidth = 6
  g.beginPath()
  g.arc(128, 128, 96, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#F2B632'
  g.strokeStyle = '#F2B632'
  g.lineWidth = 8
  g.font = '700 42px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if (step === 0) {
    g.fillText('W', 128, 78)
    g.fillText('A', 78, 128)
    g.fillText('S', 128, 178)
    g.fillText('D', 178, 128)
  } else if (step === 1) {
    g.beginPath()
    g.moveTo(128, 70)
    g.lineTo(146, 128)
    g.lineTo(128, 116)
    g.lineTo(110, 128)
    g.closePath()
    g.fill()
    g.fillRect(120, 128, 16, 52)
  } else if (step === 2) {
    g.beginPath()
    g.arc(128, 128, 28, 0, Math.PI * 2)
    g.fill()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      g.beginPath()
      g.moveTo(128 + Math.cos(a) * 44, 128 + Math.sin(a) * 44)
      g.lineTo(128 + Math.cos(a) * 72, 128 + Math.sin(a) * 72)
      g.stroke()
    }
  } else if (step === 3) {
    g.beginPath()
    g.arc(128, 140, 48, Math.PI * 1.15, Math.PI * 1.85)
    g.stroke()
    g.beginPath()
    g.moveTo(86, 112)
    g.lineTo(64, 136)
    g.lineTo(92, 142)
    g.fill()
  } else if (step === 4) {
    g.beginPath()
    g.moveTo(128, 68)
    g.lineTo(168, 128)
    g.lineTo(128, 188)
    g.lineTo(88, 128)
    g.closePath()
    g.fill()
  } else {
    g.beginPath()
    g.arc(128, 128, 36, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.arc(128, 128, 14, 0, Math.PI * 2)
    g.fill()
  }
}
