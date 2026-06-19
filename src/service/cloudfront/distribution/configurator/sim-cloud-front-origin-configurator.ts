import type { SimCloudFrontOriginConfig } from "../../command/create-distribution/create-distribution.cmd.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCloudFrontS3Origin,
  type SimCloudFrontS3OriginResolver,
} from "../../origin/s3/sim-cloudfront-s3-origin.js";

/**
 * Applies Origin configuration to a sim CloudFront Distribution.
 */
export class SimCloudFrontOriginConfigurator {
  constructor(
    private readonly s3OriginResolver: SimCloudFrontS3OriginResolver,
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

    throw new Error(
      `Unsupported sim CloudFront Origin type for Origin ${origin.Id}`,
    );
  }
}
