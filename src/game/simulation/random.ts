export function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

export function randomFloat(seed: number): { seed: number; value: number } {
  const newSeed = nextSeed(seed);
  return {
    seed: newSeed,
    value: newSeed / 0xffffffff
  };
}

export function randomChoice<T>(seed: number, items: T[]): { seed: number; value: T } {
  const result = randomFloat(seed);
  return {
    seed: result.seed,
    value: items[Math.floor(result.value * items.length)] ?? items[0]
  };
}
