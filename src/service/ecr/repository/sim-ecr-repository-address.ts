import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * Where a simulated ECR repository is, in the two forms AWS names it by.
 *
 * The registry host carries the account and the region, which is what makes
 * one account's `orders` repository a different repository from another's. It
 * is the form a Lambda `Code.ImageUri` names, while the ARN is the form an IAM
 * policy and a `Fn::GetAtt` name.
 */
export class SimEcrRepositoryAddress {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(accountRegionScope: SimAwsAccountRegionScope) {
    this.accountRegionScope = accountRegionScope;
  }

  /**
   * The registry host every repository in this account and region is under.
   */
  registryHost(): string {
    const { accountId, regionName } = this.accountRegionScope;

    return `${accountId}.dkr.ecr.${regionName}.amazonaws.com`;
  }

  /**
   * The repository URI, which an image URI is this followed by a tag.
   */
  uri(repositoryName: string): string {
    return `${this.registryHost()}/${repositoryName}`;
  }

  /**
   * The repository ARN.
   */
  arn(repositoryName: string): SimArn {
    const { accountId, regionName } = this.accountRegionScope;

    return `arn:aws:ecr:${regionName}:${accountId}:repository/${repositoryName}`;
  }
}
