interface SimWafRestApiStageProperties {
  readonly arn: string;
  readonly regionName: string;
  readonly restApiId: string;
  readonly stageName: string;
}

/**
 * One API Gateway REST API stage, as the ARN an association names it by.
 *
 * The ARN is written `arn:aws:apigateway:<region>::/restapis/<id>/stages/<name>`
 * and carries no Account.
 */
export class SimWafRestApiStage {
  /** The type this resource is listed under by ListResourcesForWebACL. */
  public readonly resourceType = "API_GATEWAY";

  /**
   * The Account the stage is in, which its ARN does not name. A web ACL and
   * the resource it protects are in the same Account on AWS, so the Account is
   * the one the WAFv2 handling the request belongs to.
   */
  public readonly accountId: string | undefined = undefined;

  public readonly arn: string;
  public readonly regionName: string;
  public readonly restApiId: string;
  public readonly stageName: string;

  constructor(properties: SimWafRestApiStageProperties) {
    this.arn = properties.arn;
    this.regionName = properties.regionName;
    this.restApiId = properties.restApiId;
    this.stageName = properties.stageName;
  }
}
