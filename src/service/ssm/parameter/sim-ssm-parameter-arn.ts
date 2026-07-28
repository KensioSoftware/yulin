import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The part of a parameter ARN that comes before the parameter's own name.
 *
 * It ends in a slash, and the name follows it with its own leading slash
 * dropped, so `/myapp/prod/db-host` becomes `...:parameter/myapp/prod/db-host`
 * rather than `...:parameter//myapp/prod/db-host`.
 */
export function ssmParameterArnPrefix(
  accountRegionScope: SimAwsAccountRegionScope,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:aws:ssm:${regionName}:${accountId}:parameter/`;
}

interface SimSsmParameterArnProperties {
  readonly resource: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The ARN of one simulated parameter.
 *
 * The single detail worth getting right here is the leading slash. A
 * hierarchical parameter name starts with one and its ARN does not repeat it,
 * so an IAM policy written as `...:parameter//myapp/prod/db-host` matches
 * nothing. Building the ARN in one place is what makes a policy that works
 * here one that would work on real AWS.
 */
export class SimSsmParameterArn {
  /**
   * The parameter name with its leading slash dropped, which is the part of
   * the ARN after `parameter/`.
   */
  public readonly resource: string;

  public readonly value: string;

  constructor(properties: SimSsmParameterArnProperties) {
    this.resource = properties.resource;
    this.value =
      ssmParameterArnPrefix(properties.accountRegionScope) + this.resource;
  }
}
