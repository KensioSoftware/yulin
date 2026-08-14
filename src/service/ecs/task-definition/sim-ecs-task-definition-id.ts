import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { parseSimEcsArn } from "../sim-ecs-arn.js";
import { SimEcsClientException } from "../error/sim-ecs.error.js";

/**
 * What a request means when it names a task definition.
 *
 * The three forms ECS accepts come down to two things: which family, and which
 * revision of it. A family on its own leaves the revision open, which is what
 * makes it mean the latest active one.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_DescribeTaskDefinition.html
 */
export class SimEcsTaskDefinitionId {
  public readonly family: string;
  public readonly revision: number | undefined;

  private constructor(family: string, revision: number | undefined) {
    this.family = family;
    this.revision = revision;
  }

  /**
   * Read an identifier that is a family, a `family:revision`, or a full ARN.
   */
  static parse(
    identifier: string | undefined,
    accountRegionScope: SimAwsAccountRegionScope,
  ): SimEcsTaskDefinitionId {
    if (identifier === undefined || identifier === "") {
      throw new SimEcsClientException(
        "A task definition family, family:revision, or ARN is required.",
      );
    }

    if (identifier.startsWith("arn:")) {
      return this.fromArn(identifier, accountRegionScope);
    }

    return this.fromFamily(identifier, identifier);
  }

  /**
   * Read the family and revision out of a task definition ARN.
   *
   * An ARN belonging to another Account or Region names nothing here, because
   * it names a task definition somewhere else on real AWS. It is refused the
   * way a task definition that is not there is refused.
   */
  private static fromArn(
    identifier: string,
    accountRegionScope: SimAwsAccountRegionScope,
  ): SimEcsTaskDefinitionId {
    const arn = parseSimEcsArn(identifier);
    const { regionName, accountId } = accountRegionScope;

    if (
      arn?.resourceType !== "task-definition" ||
      arn.region !== regionName ||
      arn.accountId !== accountId
    ) {
      throw new SimEcsClientException(
        `Unable to describe task definition. ${identifier} does not name a ` +
          `task definition in Account ${accountId} Region ${regionName}.`,
      );
    }

    return this.fromFamily(arn.resourceId, identifier);
  }

  /**
   * Read a `family` or `family:revision`, whichever this is.
   */
  private static fromFamily(
    value: string,
    identifier: string,
  ): SimEcsTaskDefinitionId {
    const separatorIndex = value.lastIndexOf(":");

    if (separatorIndex === -1) {
      return new SimEcsTaskDefinitionId(value, undefined);
    }

    return new SimEcsTaskDefinitionId(
      value.slice(0, separatorIndex),
      this.revisionNumber(value.slice(separatorIndex + 1), identifier),
    );
  }

  private static revisionNumber(value: string, identifier: string): number {
    const revision = Number(value);

    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new SimEcsClientException(
        `Unable to describe task definition. ${identifier} does not name a ` +
          `revision, which is a whole number from 1.`,
      );
    }

    return revision;
  }
}
