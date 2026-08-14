import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * Builds simulated ECS task definition ARNs for one Account and Region.
 *
 * The resource part is `family:revision`, so an ARN names one revision rather
 * than the family it belongs to. That is why a family on its own and an ARN
 * are different kinds of identifier even though both are accepted wherever a
 * task definition is named.
 */
export class SimEcsTaskDefinitionArn {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(accountRegionScope: SimAwsAccountRegionScope) {
    this.accountRegionScope = accountRegionScope;
  }

  /**
   * The ARN one revision of a family has in this Account and Region.
   */
  make(family: string, revision: number): SimArn {
    const { regionName, accountId } = this.accountRegionScope;

    return `arn:aws:ecs:${regionName}:${accountId}:task-definition/${family}:${String(revision)}`;
  }
}
