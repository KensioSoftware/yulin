import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimIam } from "../../iam/index.js";
import type { SimAwsAccountRegionScope } from "../sim-aws-account-region-scope.js";

/**
 * What every simulated service scoped to an Account and Region is built with.
 *
 * These three go together because each of them answers the same question from
 * a different side: which Account and Region the service's state belongs to,
 * which IAM decides its requests, and which scheduler its asynchronous
 * behaviour runs on. A service that needs nothing else is built from this
 * alone, and one that reaches other simulated services adds them to it.
 */
export interface SimAwsScopedServiceProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly iam: SimIam;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}
