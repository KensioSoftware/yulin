import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";

/**
 * What a caller can say about itself alongside a simulated DynamoDB command.
 *
 * Every command takes the same thing, which is who is asking. Leaving it out
 * makes the request the Account root's, as an unauthenticated caller of a
 * simulated service is.
 */
export interface SimDynamoDbRequestOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * What one simulated DynamoDB is built with.
 *
 * Every part has a default, so `new SimDynamoDb()` gives a service of its own
 * with its own tables, its own clock and no authorization.
 */
export interface SimDynamoDbProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}
