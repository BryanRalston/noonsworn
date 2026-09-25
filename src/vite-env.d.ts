/// <reference types="vite/client" />

declare const __VERSION__: string
declare const __SHA__: string

declare module 'three/addons/utils/BufferGeometryUtils.js' {
  import { BufferGeometry } from 'three'
  export function mergeGeometries(geometries: BufferGeometry[], useGroups?: boolean): BufferGeometry | null
}

interface Window {
  __noonsworn?: unknown
}
