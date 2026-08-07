import type { SimCloudFrontOriginConfig } from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCloudFrontS3Origin,
  type SimCloudFrontS3OriginResolver,
} from "../../origin/s3/sim-cloudfront-s3-origin.js";
import { assertNoSimCfS3OriginAccessIdentity } from "../../origin/s3/sim-cf-s3-origin-access-identity.js";
import type { SimCfCustomOriginDispatcher } from "../../origin/custom/sim-cf-custom-origin-dispatcher.js";
import { SimCloudFrontCustomOrigin } from "../../origin/custom/sim-cloudfront-custom-origin.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import type { SimCloudFrontOriginAccessControlRegistry } from "../../origin-access-control/sim-cf-origin-access-control-registry.js";
import { SimCloudFrontInvalidOriginAccessControl } from "../../error/sim-cloudfront.error.js";

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
    private readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry,
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

    const originAccessControl = this.originAccessControl(
      origin.Id,
      origin.OriginAccessControlId,
    );

    if (origin.S3OriginConfig !== undefined) {
      assertNoSimCfS3OriginAccessIdentity(origin.Id, origin.S3OriginConfig);

      const originBucket = this.s3OriginResolver(origin.DomainName);

      assertDefined(
        originBucket,
        `Sim S3 Bucket for CloudFront Origin ${origin.DomainName}`,
      );

      distribution.addOrigin(
        origin.Id,
        new SimCloudFrontS3Origin({
          originBucket,
          originPath: origin.OriginPath,
          ...(originAccessControl !== undefined && { originAccessControl }),
        }),
      );
      return;
    }

    if (origin.CustomOriginConfig !== undefined) {
      this.assertNoOriginAccessControl(origin.Id, originAccessControl);

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

  /**
   * Resolve the origin access control an Origin names.
   *
   * CloudFront refuses a Distribution whose Origin names an origin access
   * control the account does not hold, so an ID nothing here created is
   * refused rather than stored as written. An empty ID means no origin access
   * control, which is how the CloudFront API says an Origin has none.
   */
  private originAccessControl(
    originId: string,
    originAccessControlId: string | undefined,
  ): SimCloudFrontOriginAccessControl | undefined {
    if (
      originAccessControlId === undefined ||
      originAccessControlId.length === 0
    ) {
      return undefined;
    }

    const originAccessControl = this.originAccessControls.byId(
      originAccessControlId,
    );

    if (originAccessControl === undefined) {
      throw new SimCloudFrontInvalidOriginAccessControl(
        `Sim CloudFront Origin ${originId} names origin access control ` +
          `${originAccessControlId}, which does not exist. Only an origin ` +
          `access control an AWS::CloudFront::OriginAccessControl Resource ` +
          `created in this simulation can be named.`,
      );
    }

    return originAccessControl;
  }

  /**
   * Refuse an origin access control on a custom Origin.
   *
   * Every origin access control here signs for an S3 Origin, and CloudFront
   * refuses one whose origin type does not match the Origin it is attached to.
   */
  private assertNoOriginAccessControl(
    originId: string,
    originAccessControl: SimCloudFrontOriginAccessControl | undefined,
  ): void {
    if (originAccessControl === undefined) {
      return;
    }

    throw new SimCloudFrontInvalidOriginAccessControl(
      `Sim CloudFront custom Origin ${originId} names origin access control ` +
        `${originAccessControl.name}, which signs for an ` +
        `${originAccessControl.originType} Origin`,
    );
  }
}
