import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontNoSuchDistribution } from "../../error/sim-cloudfront.error.js";
import { simCfAuthorize } from "../../sim-cf-authorize.js";

interface SimCfInvalidationAccessProperties {
  readonly accountId: SimAwsAccountId;
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * What every invalidation command needs: the Distributions, IAM, and the
 * clock.
 *
 * The three commands all name a Distribution, authorize against its ARN and
 * resolve it the same way, so that happens here once rather than in each of
 * them.
 */
export class SimCfInvalidationAccess {
  public readonly background: BackgroundScheduler;

  private readonly accountId: SimAwsAccountId;
  private readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimCfInvalidationAccessProperties) {
    this.accountId = properties.accountId;
    this.distributions = properties.distributions;
    this.iam = properties.iam;
    this.background = properties.background;
  }

  /**
   * Resolve the Distribution an invalidation command names, having authorized
   * the action against its ARN.
   *
   * The ARN is built from the ID the caller gave, so authorization happens
   * before the Distribution map is read and an unauthorized caller learns
   * nothing about which IDs exist.
   */
  authorizedDistribution(
    action: string,
    distributionId: string | undefined,
    caller?: SimAwsCaller,
  ): SimCloudFrontDistribution {
    assertDefined(distributionId, `${action} DistributionId`);

    simCfAuthorize({
      iam: this.iam,
      action,
      resource: `arn:aws:cloudfront::${this.accountId}:distribution/${distributionId}`,
      caller,
    });

    const distribution = this.distributions.get(
      distributionId as SimCloudFrontDistributionId,
    );

    if (distribution === undefined) {
      throw new SimCloudFrontNoSuchDistribution(
        `No sim CloudFront Distribution with ID ${distributionId}`,
      );
    }

    return distribution;
  }
}
