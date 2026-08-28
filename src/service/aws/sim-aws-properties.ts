import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../util/background/background.js";
import type { SimClock } from "../../util/clock/sim-clock.js";
import type { SimIamSigV4ExpectedScope } from "../iam/sigv4/sim-iam-sigv4-expected-scope.js";
import type { SimAwsAccountId } from "./sim-aws-account.js";
import type { SimAwsDefaultCaller } from "./caller/sim-aws-caller.js";
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
  /**
   * AWS Account ID this simulation uses when a call does not name one.
   * Plain strings are accepted, so callers do not need the internal
   * SimAwsAccountId brand to set it.
   */
  readonly defaultAccountId?: SimAwsAccountId | string;
  readonly defaultRegionName?: AwsRegionName;

  /**
   * The principal this simulation attributes a call naming no caller to.
   *
   * Every simulated operation takes a `caller`, and one is set for a
   * deployment through `deployTemplate` and `deployCdkOut`. This says who the
   * calls that name none are, such as the role an operator reads the account
   * through. An explicit caller always wins, as does the ambient caller of a
   * `runAs` block.
   *
   * Left out, a call naming no caller is decided as the root principal of the
   * Account it reaches. A service control policy denying that root then denies
   * the call. That is the reason to name a default.
   */
  readonly defaultCaller?: SimAwsDefaultCaller;

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
