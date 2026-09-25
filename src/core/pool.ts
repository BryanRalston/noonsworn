/** Index free-list. Slots are external; this only tracks which indices are free. */
export class FreeList {
  private readonly stack: Int32Array
  private top = 0

  constructor(capacity: number) {
    this.stack = new Int32Array(capacity)
    for (let i = capacity - 1; i >= 0; i--) this.stack[this.top++] = i
  }

  get capacity(): number {
    return this.stack.length
  }

  get free(): number {
    return this.top
  }

  get used(): number {
    return this.stack.length - this.top
  }

  acquire(): number {
    if (this.top <= 0) return -1
    return this.stack[--this.top] ?? -1
  }

  release(index: number) {
    if (this.top >= this.stack.length) return
    this.stack[this.top++] = index
  }

  reset() {
    this.top = 0
    for (let i = this.stack.length - 1; i >= 0; i--) this.stack[this.top++] = i
  }
}
