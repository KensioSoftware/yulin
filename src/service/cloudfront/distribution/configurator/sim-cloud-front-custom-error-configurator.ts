import type { SimCloudFrontCustomErrorResponseConfig } from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import {
  simCloudFrontCustomErrorCodes,
  simCloudFrontCustomErrorResponseCodes,
} from "../../custom-error/sim-cloudfront-custom-error-response.js";
import {
  SimCloudFrontInvalidArgument,
  SimCloudFrontInvalidErrorCode,
  SimCloudFrontInvalidResponseCode,
} from "../../error/sim-cloudfront.error.js";

/**
 * Applies custom error response configuration to a sim CloudFront
 * Distribution.
 *
 * CloudFront pairs `ResponsePagePath` and `ResponseCode`: a rule carrying one
 * without the other is refused rather than half applied. A rule carrying
 * neither only configures error caching, which this simulator does not model,
 * so it is accepted and left out of the Distribution's request handling.
 */
export class SimCloudFrontCustomErrorConfigurator {
  /**
   * Configure one custom error response on a Distribution.
   */
  configure(
    distribution: SimCloudFrontDistribution,
    customErrorResponse: SimCloudFrontCustomErrorResponseConfig,
  ): void {
    const errorCode = customErrorResponse.ErrorCode;
    if (
      errorCode === undefined ||
      !simCloudFrontCustomErrorCodes.has(errorCode)
    ) {
      throw new SimCloudFrontInvalidErrorCode(
        `CloudFront CustomErrorResponse ErrorCode ${String(errorCode)} is not one of ${[...simCloudFrontCustomErrorCodes].join(", ")}`,
      );
    }

    const responsePagePath = customErrorResponse.ResponsePagePath;
    const responseCode = this.responseCode(customErrorResponse.ResponseCode);

    if (responsePagePath === undefined || responsePagePath === "") {
      if (responseCode !== undefined) {
        throw new SimCloudFrontInvalidArgument(
          `CloudFront CustomErrorResponse for ${String(errorCode)} has a ResponseCode without a ResponsePagePath`,
        );
      }

      return;
    }

    if (responseCode === undefined) {
      throw new SimCloudFrontInvalidArgument(
        `CloudFront CustomErrorResponse for ${String(errorCode)} has a ResponsePagePath without a ResponseCode`,
      );
    }

    if (!responsePagePath.startsWith("/")) {
      throw new SimCloudFrontInvalidArgument(
        `CloudFront CustomErrorResponse ResponsePagePath ${responsePagePath} must begin with a forward slash`,
      );
    }

    distribution.addCustomErrorResponse({
      errorCode,
      responsePagePath,
      responseCode,
    });
  }

  private responseCode(
    responseCode: string | number | undefined,
  ): number | undefined {
    if (responseCode === undefined || responseCode === "") {
      return undefined;
    }

    const parsed = Number(responseCode);
    if (!simCloudFrontCustomErrorResponseCodes.has(parsed)) {
      throw new SimCloudFrontInvalidResponseCode(
        `CloudFront CustomErrorResponse ResponseCode ${String(responseCode)} is not one of ${[...simCloudFrontCustomErrorResponseCodes].join(", ")}`,
      );
    }

    return parsed;
  }
}
