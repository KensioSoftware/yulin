import type { SimCloudFrontOriginConfig } from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCloudFrontS3Origin,
  type SimCloudFrontS3OriginResolver,
} from "../../origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCfCustomOriginDispatcher } from "../../origin/custom/sim-cf-custom-origin-dispatcher.js";
import { SimCloudFrontCustomOrigin } from "../../origin/custom/sim-cloudfront-custom-origin.js";

/**
 * Applies Origin configuration to a sim CloudFront Distribution.
 *
 * An Origin is an S3 Origin or a custom Origin, as it is in CloudFront, and
 * which one it is decides how the simulator reaches it. A custom Origin domain
 * is not resolved here, because a Distribution and the service behind its
 * Origin are routinely created in either order, and a CloudFormation template
 * says nothing about which comes first. Resolution happens when a request is
 * served, by which time both exist.
 */
export class SimCloudFrontOriginConfigurator {
  constructor(
    private readonly s3OriginResolver: SimCloudFrontS3OriginResolver,
    private readonly customOriginDispatcher?: SimCfCustomOriginDispatcher,
  ) {}

  /**
   * Configure an Origin on a Distribution.
   */
  configure(
    distribution: SimCloudFrontDistribution,
    origin: SimCloudFrontOriginConfig,
  ): void {
    assertDefined(origin.Id, "CloudFront Origin Id");
    assertDefined(origin.DomainName, "CloudFront Origin DomainName");

    if (origin.S3OriginConfig !== undefined) {
      const bucket = this.s3OriginResolver(origin.DomainName);

      assertDefined(
        bucket,
        `Sim S3 Bucket for CloudFront Origin ${origin.DomainName}`,
      );

      distribution.addOrigin(
        origin.Id,
        new SimCloudFrontS3Origin({ bucket, originPath: origin.OriginPath }),
      );
      return;
    }

    if (origin.CustomOriginConfig !== undefined) {
      assertDefined(
        this.customOriginDispatcher,
        `Simulated AWS environment for sim CloudFront custom Origin ${origin.Id}, which a standalone SimCloudFront has no way to reach`,
      );

      distribution.addOrigin(
        origin.Id,
        new SimCloudFrontCustomOrigin({
          originId: origin.Id,
          domainName: origin.DomainName,
          originPath: origin.OriginPath,
          dispatcher: this.customOriginDispatcher,
        }),
      );
      return;
    }

    throw new Error(
      `Unsupported sim CloudFront Origin type for Origin ${origin.Id}`,
    );
  }
}
