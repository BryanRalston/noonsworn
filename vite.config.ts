import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { writeArtManifest } from './scripts/manifest.mjs'

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

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  base: '/noonsworn/',
  plugins: [artManifest()],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __SHA__: JSON.stringify(process.env.GITHUB_SHA ?? 'dev'),
  },
  build: {
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
