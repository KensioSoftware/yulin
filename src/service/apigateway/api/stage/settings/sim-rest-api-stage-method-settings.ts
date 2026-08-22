import type { SimClock } from "../../../../../util/clock/sim-clock.js";
import { SimTokenBucket } from "../../../../../util/throttle/sim-token-bucket.js";
import type {
  SimRestApiMethodSettings,
  SimRestApiMethodSettingsMap,
} from "./sim-rest-api-method-settings.type.js";

/**
 * The key every method of the stage falls back to, which real API Gateway
 * writes as a resource path of `/` and a star, then a star for the method.
 */
const stageDefaultKey = "/*/*";

interface SimRestApiStageMethodSettingsProperties {
  readonly clock: SimClock;
  readonly methodSettings?: SimRestApiMethodSettingsMap | undefined;
}

/**
 * The method settings one stage was created with, and the token buckets its
 * throttle is evaluated from.
 *
 * A setting is addressed by `{resourcePath}/{httpMethod}`, the way real API
 * Gateway addresses one. The resource path is the template the method is
 * declared at, such as `/orders/{orderId}`, and the HTTP method is the one the
 * method was declared with, so a resource declaring `ANY` is named `ANY` here.
 *
 * Each method gets a bucket of its own. Two methods on the stage default are
 * throttled apart from each other, and a named entry throttles only the method
 * it names. Every client of a method draws on that one bucket. A WAF
 * rate-based rule counts each client separately, which is the other question a
 * stack often asks.
 *
 * A method is throttled only where the settings reaching it name both limits.
 * Naming one alone leaves the other at the account limit on real AWS. Account
 * limits are outside this simulation, and a method configured that way serves
 * unthrottled.
 */
export class SimRestApiStageMethodSettings {
  readonly #clock: SimClock;
  readonly #methodSettings: ReadonlyMap<string, SimRestApiMethodSettings>;
  readonly #buckets = new Map<string, SimTokenBucket | undefined>();

  constructor(properties: SimRestApiStageMethodSettingsProperties) {
    this.#clock = properties.clock;
    this.#methodSettings = new Map(
      Object.entries(properties.methodSettings ?? {}),
    );
  }

  /**
   * Take one token for a request to a method, and answer whether the method's
   * throttle had one to give.
   *
   * A method nothing throttles is always admitted, and takes nothing.
   */
  admits(resourcePath: string, httpMethod: string): boolean {
    const bucket = this.#bucketFor(`${resourcePath}/${httpMethod}`);

    return bucket === undefined || bucket.take();
  }

  /**
   * What CreateStage and GetStage report of these settings.
   */
  view(): SimRestApiMethodSettingsMap | undefined {
    if (this.#methodSettings.size === 0) {
      return undefined;
    }

    return Object.fromEntries(this.#methodSettings);
  }

  /**
   * The bucket a method key draws on, made the first time the method is asked
   * about so that it starts full at the request that found it.
   */
  #bucketFor(key: string): SimTokenBucket | undefined {
    if (!this.#buckets.has(key)) {
      this.#buckets.set(key, this.#newBucket(key));
    }

    return this.#buckets.get(key);
  }

  #newBucket(key: string): SimTokenBucket | undefined {
    const settings =
      this.#methodSettings.get(key) ??
      this.#methodSettings.get(stageDefaultKey);
    const rateLimit = settings?.throttlingRateLimit;
    const burstLimit = settings?.throttlingBurstLimit;

    if (rateLimit === undefined || burstLimit === undefined) {
      return undefined;
    }

    return new SimTokenBucket({ clock: this.#clock, rateLimit, burstLimit });
  }
}
