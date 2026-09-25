import { FEATURES } from '../data/features'

export function shortSha(sha: string): string {
  if (!sha || sha === 'dev' || sha.length <= 7) return sha || 'dev'
  return sha.slice(0, 7)
}

export interface FeatureMap {
  root: HTMLElement
  toggle: () => void
  close: () => void
  refresh: () => void
}

export function createFeatureMap(info: () => { version: string; sha: string; tier: string }): FeatureMap {
  const root = document.createElement('div')
  root.id = 'feature-map'
  root.hidden = true
  root.innerHTML = `<div class="panel"><header><h2>Feature Map</h2><p id="feature-meta"></p><button type="button" id="feature-close">Close</button></header><div id="feature-list"></div></div>`
  const meta = root.querySelector('#feature-meta') as HTMLElement
  const list = root.querySelector('#feature-list') as HTMLElement
  let open = false
  function refresh() {
    const about = info()
    meta.textContent = `v${about.version} · ${shortSha(about.sha)} · ${about.tier} · web`
    list.replaceChildren()
    let area = ''
    let group: HTMLElement | null = null
    for (let i = 0; i < FEATURES.length; i++) {
      const row = FEATURES[i]
      if (!row) continue
      if (row.area !== area) {
        area = row.area
        group = document.createElement('section')
        const h = document.createElement('h3')
        h.textContent = area
        group.append(h)
        list.append(group)
      }
      const item = document.createElement('div')
      item.className = 'feature-row'
      const name = document.createElement('span')
      name.textContent = row.feature
      const badge = document.createElement('span')
      badge.className = `badge ${row.status}`
      badge.textContent = `${row.status} · ${row.since}`
      item.append(name, badge)
      group?.append(item)
    }
  }
  const map: FeatureMap = {
    root,
    toggle() {
      open = !open
      root.hidden = !open
      if (open) refresh()
    },
    close() {
      open = false
      root.hidden = true
    },
    refresh,
  }
  root.querySelector('#feature-close')?.addEventListener('click', () => map.close())
  return map
}
