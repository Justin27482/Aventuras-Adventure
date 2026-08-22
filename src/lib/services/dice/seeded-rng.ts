/**
 * Seeded, deterministic RNG for reproducible dice rolls.
 * Same seed always produces the same sequence, so a logged roll can be replayed
 * or audited exactly.
 */

/** Hash an arbitrary string seed into a 32-bit integer (cyrb53-lite). */
function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  return h1 >>> 0
}

/** mulberry32 PRNG: fast, small, good-enough statistical quality for dice rolls. */
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Creates a deterministic RNG function returning floats in [0, 1) for the given seed. */
export function createSeededRng(seed: string): () => number {
  return mulberry32(hashSeed(seed))
}

/** Rolls one die of `sides` faces (1..sides inclusive) using the given RNG. */
export function rollDie(rng: () => number, sides: number): number {
  return Math.floor(rng() * sides) + 1
}

/** Generates a fresh random seed string for a new roll (not itself deterministic). */
export function generateRollSeed(): string {
  return crypto.randomUUID()
}
