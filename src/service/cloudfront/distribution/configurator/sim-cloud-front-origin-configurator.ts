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
import { assertSimCfOacOriginType } from "../../origin-access-control/sim-cf-oac-origin-type.js";
import { SimCloudFrontInvalidOriginAccessControl } from "../../error/sim-cloudfront.error.js";
import { simCfOriginCustomHeaders } from "../../origin/sim-cf-origin-custom-headers.js";

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
    // Read for both Origin kinds, since CloudFront refuses a header name it
    // cannot add whichever kind the Origin turns out to be. Only a custom
    // Origin goes on to carry them. An S3 Origin here reads its Bucket through
    // GetObject and builds no request for a header to travel on, and real S3
    // ignores a header it has no use for either way.
    const customHeaders = simCfOriginCustomHeaders(origin.Id, origin);

    if (origin.S3OriginConfig !== undefined) {
      assertNoSimCfS3OriginAccessIdentity(origin.Id, origin.S3OriginConfig);
      assertSimCfOacOriginType(origin.Id, "s3", originAccessControl);

      const originBucket = this.s3OriginResolver(origin.DomainName);

      assertDefined(
        originBucket,
        `Sim S3 Bucket for CloudFront Origin ${origin.DomainName}`,
      );

      distribution.addOrigin(
        origin.Id,
        new SimCloudFrontS3Origin({
          originBucket,
          domainName: origin.DomainName,
          originPath: origin.OriginPath,
          ...(originAccessControl !== undefined && { originAccessControl }),
        }),
      );
      return;
    }

    if (origin.CustomOriginConfig !== undefined) {
      // A custom Origin is reached over HTTP, so the only origin access control
      // that can sign for one is the Lambda Function URL type.
      assertSimCfOacOriginType(origin.Id, "lambda", originAccessControl);

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
          customHeaders,
          ...(originAccessControl !== undefined && { originAccessControl }),
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
}
