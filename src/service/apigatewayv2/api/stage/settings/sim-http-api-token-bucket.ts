import type { SimClock } from "../../../../../util/clock/sim-clock.js";

const millisecondsPerSecond = 1000;

interface SimHttpApiTokenBucketProperties {
  readonly clock: SimClock;
  /** Tokens added per second, which is `ThrottlingRateLimit`. */
  readonly rateLimit: number;
  /** How many tokens the bucket holds, which is `ThrottlingBurstLimit`. */
  readonly burstLimit: number;
}

/**
 * The token bucket one throttled route is served from.
 *
 * The bucket starts full. A route whose burst is five serves five requests
 * before the rate matters. Each request takes a token, and tokens come back at
 * the rate limit, up to the burst limit.
 *
 * Refilling is a function of the simulated clock. A frozen clock holds the
 * bucket where it is, and a test moves the clock to fill it. Every client of
 * the route draws on this one bucket.
 */
export class SimHttpApiTokenBucket {
  readonly #clock: SimClock;
  readonly #rateLimit: number;
  readonly #burstLimit: number;
  #tokens: number;
  #filledAt: number;

  constructor(properties: SimHttpApiTokenBucketProperties) {
    this.#clock = properties.clock;
    this.#rateLimit = properties.rateLimit;
    this.#burstLimit = properties.burstLimit;
    this.#tokens = properties.burstLimit;
    this.#filledAt = properties.clock.now().getTime();
  }

  /**
   * Take one token for a request, and answer whether there was one to take.
   */
  take(): boolean {
    this.#refill();

    if (this.#tokens < 1) {
      return false;
    }

    this.#tokens -= 1;

    return true;
  }

  /**
   * Add whatever has accrued since the bucket was last read.
   *
   * A clock that has gone backwards, which a test setting an earlier instant
   * can do, adds nothing rather than taking tokens away.
   */
  #refill(): void {
    const now = this.#clock.now().getTime();
    const elapsed = Math.max(0, now - this.#filledAt) / millisecondsPerSecond;

    this.#filledAt = now;
    this.#tokens = Math.min(
      this.#burstLimit,
      this.#tokens + elapsed * this.#rateLimit,
    );
  }
}
