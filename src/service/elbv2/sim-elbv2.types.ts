import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimAcmRegistry } from "../acm/registry/sim-acm-registry.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimElbV2Registry } from "./registry/sim-elbv2-registry.js";

/**
 * What one simulated ELBv2 scope is built with.
 *
 * This is held apart from the facade because that file grows by a delegating
 * method per simulated operation and is close to the max-lines limit, which is
 * the same reason simulated DynamoDB reads this way.
 */
export interface SimElbV2Properties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  /**
   * Cross-scope index of load balancer DNS names, which is how a request
   * arriving at one finds the Account that owns it.
   */
  readonly registry?: SimElbV2Registry;
  /**
   * Cross-scope index of simulated ACM, which is how a listener gets from the
   * certificate ARN it was given to the certificate that ARN names. With none,
   * as in a standalone `SimElbV2`, there is no simulated ACM to check a
   * listener's certificate against and nothing is checked.
   */
  readonly acmRegistry?: SimAcmRegistry;
}
