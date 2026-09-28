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
    now: { moving: boolean; litNear: boolean; inLight: boolean; device: string },
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
  canvas.width = 128
  canvas.height = 128
  const tex = new CanvasTexture(canvas)
  tex.anisotropy = 2
  const mesh = new Mesh(
    new PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  )
  mesh.position.y = 0.05
  mesh.renderOrder = 3
  mesh.frustumCulled = false
  mesh.visible = false
  scene.add(mesh)
  const label = document.createElement('div')
  label.id = 'coach'
  label.hidden = true
  parent.append(label)
  const v = new Vector3()
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
  let drawn = -1
  let drawnDevice = ''

  function save() {
    storageSet(KEY, step >= 6 ? 'done' : String(step))
  }
  function hide() {
    mesh.visible = false
    label.hidden = true
  }
  function advance() {
    step++
    timer = 0
    if (step === 1) {
      moved = false
      killed = false
    }
    if (step === 3) cut = false
    if (step === 4) collected = false
    if (step === 5) claimed = false
    save()
  }
  function ready(): boolean {
    if (timer < 0.45) return false
    if (step === 0) return false
    if (step === 1) return killed
    if (step === 2) return false
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
      if (device === 'touch') return 'Dash-slash through them. Tap the right side.'
      if (device === 'pad') return 'Dash-slash through them. Press A.'
      return 'Dash-slash through them. Press Space.'
    }
    if (step === 4) return 'Collect shards'
    return 'Power-up ready. Tap the halo.'
  }

  const api: Tutorial = {
    mesh,
    begin(on) {
      enabled = on
      step = readStep()
      timer = 0
      outline = 0
      outlined = false
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
      cut = true
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
      if (now.moving) moved = true
      if (step === 5 && !charged) {
        hide()
        timer = 0
        return
      }
      timer += dt
      if (step === 0 && moved && timer >= 0.45) advance()
      else if (step === 2 && now.inLight && timer >= 0.45) advance()
      else if (timer >= 12 || ready()) advance()
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
      mesh.visible = true
      mesh.position.x = x
      mesh.position.z = z + 0.9
      label.hidden = false
      label.textContent = line(now.device)
      v.set(x, 0.4, z).project(camera)
      const sx = (v.x * 0.5 + 0.5) * width
      const sy = (-v.y * 0.5 + 0.5) * height + 28
      label.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, 0)`
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
  g.clearRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(20, 18, 37, 0.82)'
  g.beginPath()
  g.arc(64, 64, 58, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#F2B632'
  g.lineWidth = 3
  g.stroke()
  g.fillStyle = '#F2B632'
  g.strokeStyle = '#F2B632'
  if (step === 0) {
    g.font = '700 18px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('W', 64, 34)
    g.fillText('A', 40, 64)
    g.fillText('S', 64, 94)
    g.fillText('D', 88, 64)
  } else if (step === 1) {
    g.beginPath()
    g.moveTo(64, 28)
    g.lineTo(72, 64)
    g.lineTo(64, 58)
    g.lineTo(56, 64)
    g.closePath()
    g.fill()
    g.fillRect(60, 64, 8, 32)
  } else if (step === 2) {
    g.beginPath()
    g.arc(64, 64, 16, 0, Math.PI * 2)
    g.fill()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      g.beginPath()
      g.moveTo(64 + Math.cos(a) * 24, 64 + Math.sin(a) * 24)
      g.lineTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40)
      g.stroke()
    }
  } else if (step === 3) {
    g.beginPath()
    g.arc(64, 70, 28, Math.PI * 1.15, Math.PI * 1.85)
    g.stroke()
    g.beginPath()
    g.moveTo(40, 58)
    g.lineTo(28, 70)
    g.lineTo(42, 74)
    g.fill()
  } else if (step === 4) {
    g.beginPath()
    g.moveTo(64, 30)
    g.lineTo(84, 64)
    g.lineTo(64, 98)
    g.lineTo(44, 64)
    g.closePath()
    g.fill()
  } else {
    g.beginPath()
    g.arc(64, 64, 22, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.arc(64, 64, 8, 0, Math.PI * 2)
    g.fill()
  }
}
