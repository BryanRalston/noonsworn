export interface EventMap {
  levelUp: { pending: number }
  runEnd: { victory: boolean; time: number; kills: number; level: number }
  hurt: { amount: number }
}

type AnyHandler = (payload: EventMap[keyof EventMap]) => void

export function createEvents() {
  const map = new Map<keyof EventMap, AnyHandler[]>()
  return {
    on<K extends keyof EventMap>(type: K, handler: (payload: EventMap[K]) => void) {
      const list = map.get(type) ?? []
      list.push(handler as AnyHandler)
      map.set(type, list)
    },
    emit<K extends keyof EventMap>(type: K, payload: EventMap[K]) {
      const list = map.get(type)
      if (!list) return
      for (let i = 0; i < list.length; i++) list[i]?.(payload)
    },
  }
}

export type Events = ReturnType<typeof createEvents>
