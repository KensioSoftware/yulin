import type { SimClock } from "../../../../../util/clock/sim-clock.js";
import type {
  SimHttpApiRouteSettings,
  SimHttpApiRouteSettingsMap,
  SimHttpApiRouteSettingsView,
} from "./sim-http-api-route-settings.type.js";
import { SimHttpApiTokenBucket } from "./sim-http-api-token-bucket.js";

interface SimHttpApiStageRouteSettingsProperties {
  readonly clock: SimClock;
  readonly defaultRouteSettings?: SimHttpApiRouteSettings | undefined;
  readonly routeSettings?: SimHttpApiRouteSettingsMap | undefined;
}

/**
 * The route settings one stage was created with, and the token buckets its
 * throttle is evaluated from.
 *
 * Each route key has a bucket of its own. Two routes falling back to
 * `DefaultRouteSettings` are throttled apart from each other, and a
 * `RouteSettings` entry throttles only the route key it names. Every client of
 * a route draws on that one bucket. A WAF rate-based rule counts each client
 * separately, which is the other question a stack often asks.
 *
 * A route is throttled only where the settings reaching it name both limits.
 * Naming one alone leaves the other at the account limit on real AWS. Account
 * limits are outside this simulation, and a route configured that way serves
 * unthrottled.
 */
export class SimHttpApiStageRouteSettings {
  readonly #clock: SimClock;
  readonly #defaultRouteSettings?: SimHttpApiRouteSettings | undefined;
  readonly #routeSettings: ReadonlyMap<string, SimHttpApiRouteSettings>;
  readonly #buckets = new Map<string, SimHttpApiTokenBucket | undefined>();

  constructor(properties: SimHttpApiStageRouteSettingsProperties) {
    this.#clock = properties.clock;
    this.#defaultRouteSettings = properties.defaultRouteSettings;
    this.#routeSettings = new Map(
      Object.entries(properties.routeSettings ?? {}),
    );
  }

  /**
   * Take one token for a request to a route key, and answer whether the
   * route's throttle had one to give.
   *
   * A route key nothing throttles is always admitted, and takes nothing.
   */
  admits(routeKey: string): boolean {
    const bucket = this.#bucketFor(routeKey);

    return bucket === undefined || bucket.take();
  }

  /**
   * What CreateStage and GetStages report of these settings.
   */
  view(): SimHttpApiRouteSettingsView {
    const view: SimHttpApiRouteSettingsView = {};

    if (this.#defaultRouteSettings !== undefined) {
      view.DefaultRouteSettings = { ...this.#defaultRouteSettings };
    }

    if (this.#routeSettings.size > 0) {
      view.RouteSettings = Object.fromEntries(this.#routeSettings);
    }

    return view;
  }

  /**
   * The bucket a route key draws on, made the first time the route is asked
   * about so that it starts full at the request that found it.
   */
  #bucketFor(routeKey: string): SimHttpApiTokenBucket | undefined {
    if (!this.#buckets.has(routeKey)) {
      this.#buckets.set(routeKey, this.#newBucket(routeKey));
    }

    return this.#buckets.get(routeKey);
  }

  #newBucket(routeKey: string): SimHttpApiTokenBucket | undefined {
    const settings =
      this.#routeSettings.get(routeKey) ?? this.#defaultRouteSettings;
    const rateLimit = settings?.ThrottlingRateLimit;
    const burstLimit = settings?.ThrottlingBurstLimit;

    if (rateLimit === undefined || burstLimit === undefined) {
      return undefined;
    }

    return new SimHttpApiTokenBucket({
      clock: this.#clock,
      rateLimit,
      burstLimit,
    });
  }
}
