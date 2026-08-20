interface SimWafUserPoolProperties {
  readonly arn: string;
  readonly regionName: string;
  readonly accountId: string;
  readonly userPoolId: string;
}

/**
 * One Cognito user pool, as the ARN an association names it by.
 *
 * The ARN is written `arn:aws:cognito-idp:<region>:<account>:userpool/<pool-id>`
 * and names both the Account and the Region, where a REST API stage ARN names
 * neither. The pool id repeats the Region, as a real pool id does.
 */
export class SimWafUserPool {
  /** The type this resource is listed under by ListResourcesForWebACL. */
  public readonly resourceType = "COGNITO_USER_POOL";

  public readonly arn: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly userPoolId: string;

  constructor(properties: SimWafUserPoolProperties) {
    this.arn = properties.arn;
    this.regionName = properties.regionName;
    this.accountId = properties.accountId;
    this.userPoolId = properties.userPoolId;
  }
}
