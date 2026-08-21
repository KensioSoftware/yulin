import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCognitoUserPoolId } from "./sim-cognito-user-pool-id.js";

/**
 * The part of a user pool ARN that comes before the pool's own id.
 */
export function cognitoUserPoolArnPrefix(
  accountRegionScope: SimAwsAccountRegionScope,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:aws:cognito-idp:${regionName}:${accountId}:userpool/`;
}

interface SimCognitoUserPoolArnProperties {
  readonly userPoolId: SimCognitoUserPoolId;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The ARN of one simulated user pool.
 *
 * A pool ARN is the pool id after `userpool/`, and the id already names its
 * region, so the region appears twice:
 * `arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_aBcDeFgHi`.
 * This is the resource every user pool IAM policy is written against,
 * including the policies for app client operations, which have no ARN of
 * their own.
 */
export class SimCognitoUserPoolArn {
  public readonly value: string;

  /**
   * The Account that owns the pool.
   *
   * This is kept alongside the ARN because it is what another service supplies
   * as `AWS:SourceAccount` when the pool reaches it, such as a Lambda trigger
   * invocation, and it is the Account whose SES a pool sending through
   * `DEVELOPER` email resolves its identity in.
   */
  public readonly accountId: SimAwsAccountId;

  constructor(properties: SimCognitoUserPoolArnProperties) {
    this.value =
      cognitoUserPoolArnPrefix(properties.accountRegionScope) +
      properties.userPoolId;
    this.accountId = properties.accountRegionScope.accountId;
  }
}
