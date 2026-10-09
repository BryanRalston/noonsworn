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

let failCommit = false

/** Test hook: the next commit fails the way a full quota does. */
export function storageFailNext(): void {
  failCommit = true
}

/** Writes the meta envelope. A quota error restores the previous value and returns false. */
export function storageCommit(key: string, value: string): boolean {
  const had = memory.has(key)
  const prev = memory.get(key)
  memory.set(key, value)
  try {
    if (failCommit) {
      failCommit = false
      throw new Error('quota')
    }
    localStorage.setItem(key, value)
    return true
  } catch {
    if (had && prev !== undefined) memory.set(key, prev)
    else memory.delete(key)
    return false
  }
}
