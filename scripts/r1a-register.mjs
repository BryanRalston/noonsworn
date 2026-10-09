import { register } from 'node:module'

register(new URL('./r1a-ext.mjs', import.meta.url), import.meta.url)
