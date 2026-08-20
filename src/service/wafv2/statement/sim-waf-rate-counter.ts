import type { SimClock } from "../../../util/clock/sim-clock.js";

interface SimWafRateCounterProperties {
  readonly clock: SimClock;
  readonly windowMilliseconds: number;
}

/**
 * What one rate-based rule has counted, by aggregation instance.
 *
 * A count is a window over the simulated clock rather than a running total.
 * The instant of each request is kept, and the instants that have fallen out
 * of the window are dropped as the key is read, so a simulation whose clock
 * has been advanced past the window finds the rule counting from nothing
 * again.
 *
 * The counts belong to the compiled rule, so writing a new set of rules over a
 * web ACL starts them again. Real WAF does the same with a rule it has just
 * been given.
 */
export class SimWafRateCounter {
  readonly #clock: SimClock;
  readonly #windowMilliseconds: number;
  readonly #counted = new Map<string, number[]>();

  constructor(properties: SimWafRateCounterProperties) {
    this.#clock = properties.clock;
    this.#windowMilliseconds = properties.windowMilliseconds;
  }

  /**
   * Count one request against an aggregation key, and answer with what the
   * window holds for that key once it has been counted.
   */
  count(key: string): number {
    const now = this.#clock.now().getTime();
    const since = now - this.#windowMilliseconds;
    const within = (this.#counted.get(key) ?? []).filter((at) => at > since);

    within.push(now);
    this.#counted.set(key, within);

    return within.length;
  }
}
