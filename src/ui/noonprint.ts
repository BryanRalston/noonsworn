export interface PrintView {
  temple: string
  date: string
  seconds: number
  cleared: boolean
  line: string
  bits: number[]
}

const GOLD = '#F2B632'
const INK = '#141225'
const PAPER = '#F4E6C4'
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function checkCode(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  let x = h >>> 0
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += CODE[x & 31]
    x = (Math.imul(x, 33) ^ (x >>> 5)) >>> 0
  }
  return out
}

function shadeBar(bits: ArrayLike<number>, seconds: number): string {
  const n = Math.max(1, seconds | 0)
  let out = ''
  for (let c = 0; c < 24; c++) {
    const a = (c * n / 24) | 0
    const b = Math.max(a + 1, ((c + 1) * n / 24) | 0)
    let lit = 0
    let tot = 0
    for (let s = a; s < b && s < n; s++) {
      tot++
      const w = bits[s >> 5] ?? 0
      if (w & (1 << (s & 31))) lit++
    }
    out += tot > 0 && lit * 2 >= tot ? '#' : '-'
  }
  return out
}

export function printText(view: PrintView): string {
  const bar = shadeBar(view.bits, view.seconds)
  const body = [
    'Noon Print',
    view.temple,
    `${view.date} UTC`,
    view.cleared ? `Cleared ${clock(view.seconds)}` : `Survived ${clock(view.seconds)}`,
    view.line,
    'same conditions',
    bar,
  ].join('\n')
  return `${body}\n${checkCode(body)}\nplayed on this device`
}

export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function drawPrint(canvas: HTMLCanvasElement, view: PrintView): void {
  const w = 1080
  const h = 1350
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, w, h)
  const cx = 540
  const cy = 640
  const outer = 430
  ctx.beginPath()
  ctx.arc(cx, cy, outer + 18, 0, Math.PI * 2)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, outer, 0, Math.PI * 2)
  ctx.fillStyle = '#FBF6EC'
  ctx.fill()
  const n = Math.max(1, view.seconds | 0)
  const bits = view.bits
  for (let s = 0; s < n; s++) {
    const lit = ((bits[s >> 5] ?? 0) & (1 << (s & 31))) !== 0
    const a = -Math.PI / 2 + (s / n) * Math.PI * 2
    const r0 = 70
    const r1 = outer - 16
    ctx.strokeStyle = lit ? GOLD : INK
    ctx.lineWidth = Math.max(2, (Math.PI * 2 * ((r0 + r1) / 2)) / n - 0.6)
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    ctx.stroke()
  }
  const end = -Math.PI / 2 + Math.PI * 2
  const mx = cx + Math.cos(end) * (outer + 4)
  const my = cy + Math.sin(end) * (outer + 4)
  ctx.fillStyle = view.cleared ? GOLD : INK
  if (view.cleared) {
    ctx.beginPath()
    ctx.arc(mx, my, 16, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillRect(mx - 12, my - 12, 24, 24)
  }
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.font = '48px system-ui, sans-serif'
  ctx.fillText(view.temple, cx, 120)
  ctx.font = '32px system-ui, sans-serif'
  ctx.fillText(`${view.date} UTC`, cx, 176)
  ctx.fillText(view.cleared ? `Cleared ${clock(view.seconds)}` : `Survived ${clock(view.seconds)}`, cx, 224)
  ctx.font = '28px system-ui, sans-serif'
  ctx.fillText(view.line, cx, 1180)
  ctx.fillText('same conditions', cx, 1230)
  ctx.font = '24px system-ui, sans-serif'
  ctx.fillText('played on this device', cx, 1290)
}

const SNAP = [
  [0xf4, 0xe6, 0xc4],
  [0xfb, 0xf6, 0xec],
  [0x14, 0x12, 0x25],
  [0xf2, 0xb6, 0x32],
]

function snapPrint(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = img.data
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    let best = 0
    let bestD = 1e12
    for (let p = 0; p < SNAP.length; p++) {
      const c = SNAP[p]
      if (!c) continue
      const d = (r - (c[0] ?? 0)) * (r - (c[0] ?? 0)) + (g - (c[1] ?? 0)) * (g - (c[1] ?? 0)) + (b - (c[2] ?? 0)) * (b - (c[2] ?? 0))
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    const c = SNAP[best]
    if (!c) continue
    data[i] = c[0] ?? 0
    data[i + 1] = c[1] ?? 0
    data[i + 2] = c[2] ?? 0
    data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

export async function paintPng(canvas: HTMLCanvasElement): Promise<Blob> {
  snapPrint(canvas)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('png')
  return blob
}

export async function copyText(text: string): Promise<boolean> {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  document.body.append(area)
  area.focus()
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  if (!ok && navigator.clipboard && window.top === window.self) {
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = false
    }
  }
  area.remove()
  return ok
}

export async function shareOrSave(blob: Blob, text: string, anchor: HTMLAnchorElement): Promise<'shared' | 'save'> {
  const file = new File([blob], 'noon-print.png', { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch {
      /* fall through to the save button */
    }
  }
  const url = URL.createObjectURL(blob)
  anchor.href = url
  anchor.download = 'noon-print.png'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'save'
}

let face: HTMLCanvasElement | null = null
let copyBtn: HTMLButtonElement | null = null
let saveBtn: HTMLButtonElement | null = null
let note: HTMLParagraphElement | null = null
let fileLink: HTMLAnchorElement | null = null
let lastBlob: Blob | null = null
let lastText = ''

export function hidePrint(): void {
  if (face) face.hidden = true
  if (copyBtn) copyBtn.hidden = true
  if (saveBtn) saveBtn.hidden = true
  if (note) note.hidden = true
  const primary = document.getElementById('btn-end')
  if (primary) primary.classList.add('primary')
}

export async function mountPrint(view: PrintView): Promise<{ bytes: number; text: string }> {
  const host = document.getElementById('end-screen')
  if (!host) return { bytes: 0, text: '' }
  if (!face) {
    face = document.createElement('canvas')
    face.id = 'print-face'
    face.style.width = 'min(240px, 72vw)'
    face.style.height = 'auto'
    face.style.display = 'block'
    face.style.margin = '8px auto'
    note = document.createElement('p')
    note.id = 'print-note'
    copyBtn = document.createElement('button')
    copyBtn.type = 'button'
    copyBtn.id = 'btn-print-copy'
    copyBtn.className = 'menu-item primary'
    copyBtn.textContent = 'Copy'
    saveBtn = document.createElement('button')
    saveBtn.type = 'button'
    saveBtn.id = 'btn-print-save'
    saveBtn.className = 'menu-item'
    saveBtn.textContent = 'Save image'
    fileLink = document.createElement('a')
    fileLink.id = 'print-file'
    fileLink.hidden = true
    const primary = document.getElementById('btn-end')
    host.insertBefore(face, primary)
    host.insertBefore(note, primary)
    host.insertBefore(copyBtn, primary)
    host.insertBefore(saveBtn, primary)
    host.append(fileLink)
    copyBtn.addEventListener('click', () => {
      void copyText(lastText).then((ok) => {
        if (copyBtn) copyBtn.textContent = ok ? 'Copied' : 'Copy'
      })
    })
    saveBtn.addEventListener('click', () => {
      if (!lastBlob || !fileLink) return
      void shareOrSave(lastBlob, lastText, fileLink)
    })
  }
  lastText = printText(view)
  drawPrint(face, view)
  lastBlob = await paintPng(face)
  const file = new File([lastBlob], 'noon-print.png', { type: 'image/png' })
  let share = false
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.canShare) {
    try {
      share = nav.canShare({ files: [file] })
    } catch {
      share = false
    }
  }
  if (saveBtn) saveBtn.textContent = share ? 'Share image' : 'Save image'
  face.hidden = false
  if (note) {
    note.hidden = false
    note.textContent = 'played on this device'
  }
  if (copyBtn) {
    copyBtn.hidden = false
    copyBtn.textContent = 'Copy'
  }
  if (saveBtn) saveBtn.hidden = false
  const primary = document.getElementById('btn-end')
  if (primary) primary.classList.remove('primary')
  return { bytes: lastBlob.size, text: lastText }
}
