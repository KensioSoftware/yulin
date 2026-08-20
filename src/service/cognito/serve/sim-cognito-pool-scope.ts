import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import { simCognitoUserPoolRegionName } from "../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";

/**
 * The simulated Cognito scope that owns a pool.
 *
 * The Account comes from the pool's ARN and the Region from its id, and each
 * scope's services are made once and kept, so this is the same service object
 * that created the pool rather than another view of it. A served request finds
 * the pool by id or by hostname, neither of which says which scope it came
 * from, so this is how the serving layer gets back to it.
 */
export function simCognitoPoolScope(
  simAws: SimAws,
  pool: SimCognitoUserPool,
): SimCognitoIdentityProvider {
  return simAws
    .account(pool.arn.accountId)
    .region(simCognitoUserPoolRegionName(pool.id) as AwsRegionName)
    .cognitoIdentityProvider();
}
