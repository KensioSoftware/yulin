/**
 * Where a simulation draws the values AWS leaves to chance.
 *
 * Some AWS behaviour is unpredictable by design, such as the moment inside a
 * Scheduler flexible time window at which the target is invoked. A simulation
 * draws those values from here, so a test can make them repeatable by passing
 * a seeded source and leave them unpredictable otherwise.
 */
export interface SimRandom {
  /**
   * The next value, at least 0 and less than 1.
   */
  next(): number;
}

/**
 * Draws from the host's `Math.random`, so values differ from run to run.
 *
 * This is the default, because a test that passes only for one particular
 * draw is relying on something AWS does not promise.
 */
export class SimHostRandom implements SimRandom {
  next(): number {
    return Math.random();
  }
}

/**
 * Draws a repeatable sequence from a seed.
 *
 * Two sources built from the same seed give the same values in the same order,
 * so a failure seen once can be reproduced. The generator is mulberry32, which
 * is small and fast and has nothing to do with security.
 */
export class SimSeededRandom implements SimRandom {
  private state: number;

  constructor(seed: number) {
    // Only the low 32 bits of the seed take part, as the generator works on
    // 32-bit integers.
    this.state = Math.trunc(seed) >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d_2b_79_f5) >>> 0;

    let mixed = this.state;

    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  }
}
