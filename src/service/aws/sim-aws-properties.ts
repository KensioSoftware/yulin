import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../util/background/background.js";
import type { SimClock } from "../../util/clock/sim-clock.js";
import type { SimIamSigV4ExpectedScope } from "../iam/sigv4/sim-iam-sigv4-expected-scope.js";
import type { SimAwsAccountId } from "./sim-aws-account.js";
import type { AwsRegionName } from "./sim-aws-region.js";

/**
 * Everything caller resolution needs besides the request itself.
 */
export interface SimAwsRequestCallerOptions {
  /**
   * The request body, already buffered by whoever received the request.
   */
  readonly body?: Uint8Array | undefined;
  /**
   * The service and Region a signature should have been scoped to, when the
   * receiving endpoint is known.
   */
  readonly expectedScope?: SimIamSigV4ExpectedScope | undefined;
}

/**
 * How one simulated AWS environment is set up.
 */
export interface SimAwsProperties {
  readonly defaultAccountId?: SimAwsAccountId;
  readonly defaultRegionName?: AwsRegionName;
  readonly background?: BackgroundScheduler & BackgroundCompleter;
  /**
   * Clock this simulation's timestamps start from, defaulting to the real
   * system clock. Simulated time is layered over it, so `clock()` can still
   * freeze, set and advance from wherever it reads. Ignored when an
   * already-built background scheduler is supplied, as that scheduler carries
   * its own clock and time control is refused.
   */
  readonly clock?: SimClock;
}
