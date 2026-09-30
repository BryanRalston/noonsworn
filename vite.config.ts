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

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  base: '/noonsworn/',
  plugins: [artManifest()],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __SHA__: JSON.stringify(commitSha()),
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
