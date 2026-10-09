import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { writeArtManifest } from './scripts/manifest.mjs'

function commitSha(): string {
  const fromEnv = process.env.GITHUB_SHA
  if (fromEnv && fromEnv !== 'dev') return fromEnv
  try {
    return execSync('git rev-parse HEAD', { cwd: process.cwd(), encoding: 'utf8' }).trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

function artManifest(): Plugin {
  return {
    name: 'noonsworn-art-manifest',
    buildStart() {
      writeArtManifest(process.cwd())
    },
    configureServer() {
      writeArtManifest(process.cwd())
    },
  }
}

/** Rolldown emits storage.ts as its own chunk even when a single chunk imports it. That file is modulepreloaded, so its gzip counts against the entry budget. Fold the minified module into the entry and drop the extra request. */
function inlineStorage(): Plugin {
  return {
    name: 'inline-storage',
    generateBundle(_opts, bundle) {
      let storageName = ''
      let storageCode = ''
      let indexName = ''
      let indexCode = ''
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk') continue
        const ownsStorage = Object.keys(item.modules).some((id) => id.replace(/\\/g, '/').endsWith('/src/platform/storage.ts'))
        if (ownsStorage) {
          storageName = name
          storageCode = item.code
          continue
        }
        if (item.fileName.startsWith('assets/index-') && item.code.length > indexCode.length) {
          indexName = name
          indexCode = item.code
        }
      }
      if (!storageName || !indexName) return
      const imported = indexCode.match(/import\{([^}]+)\}from"\.\/storage-[^"]+\.js";/)
      const exported = storageCode.match(/export\{([^}]+)\};?\s*$/)
      if (!imported || !exported || exported.index == null) return
      const body = storageCode.slice(0, exported.index)
      const locals = new Map<string, string>()
      for (const part of exported[1].split(',')) {
        const bits = part.trim().split(/\s+/)
        if (bits.length === 3 && bits[1] === 'as') locals.set(bits[2] ?? '', bits[0] ?? '')
        else if (bits[0]) locals.set(bits[0], bits[0])
      }
      const names: string[] = []
      const assign: string[] = []
      for (const part of imported[1].split(',')) {
        const bits = part.trim().split(/\s+/)
        const from = bits[0] ?? ''
        const to = bits.length === 3 ? (bits[2] ?? '') : from
        const src = locals.get(from)
        if (!to || !src) return
        names.push(to)
        assign.push(`${to}=${src}`)
      }
      const entry = bundle[indexName]
      if (!entry || entry.type !== 'chunk') return
      entry.code = indexCode.replace(imported[0], `var ${names.join(',')};(()=>{${body}${assign.join(';')}})();`)
      delete bundle[storageName]
      for (const item of Object.values(bundle)) {
        if (item.type !== 'asset' || item.fileName !== 'index.html' || typeof item.source !== 'string') continue
        item.source = item.source.replace(/\r?\n\s*<link rel="modulepreload" crossorigin href="[^"]*storage-[^"]+\.js">/, '')
      }
    },
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  base: '/noonsworn/',
  plugins: [artManifest(), inlineStorage()],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __SHA__: JSON.stringify(commitSha()),
  },
  build: {
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    modulePreload: {
      resolveDependencies(filename, deps) {
        void filename
        return deps.filter((dep) => !dep.includes('arsenal') && !dep.includes('/meta-'))
      },
    },
    rollupOptions: {
      output: {
        chunkFileNames(info) {
          const id = info.facadeModuleId?.replace(/\\/g, '/') ?? ''
          if (id.endsWith('/src/game/weapons/w2.ts')) return 'assets/arsenal-[hash].js'
          if (id.endsWith('/src/ui/metaUi.ts')) return 'assets/meta-[hash].js'
          return 'assets/[name]-[hash].js'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
