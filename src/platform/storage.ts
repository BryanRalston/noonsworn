const memory = new Map<string, string>()

export function storageGet(key: string): string | null {
  try {
    const value = localStorage.getItem(key)
    if (value != null) return value
  } catch {
    /* private mode */
  }
  return memory.get(key) ?? null
}

export function storageSet(key: string, value: string) {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode keeps the memory copy */
  }
}
