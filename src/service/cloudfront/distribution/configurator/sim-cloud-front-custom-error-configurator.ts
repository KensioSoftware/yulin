import type { SimCloudFrontCustomErrorResponseConfig } from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFrontDistribution } from "../sim-cloudfront-distribution.js";
import {
  simCloudFrontCustomErrorCodes,
  simCloudFrontCustomErrorResponseCodes,
  simCloudFrontDefaultErrorCachingMinTtlSec,
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
 * CloudFront pairs `ResponsePagePath` and `ResponseCode`. A rule carrying one
 * without the other is refused rather than half applied. A rule carrying
 * neither configures error caching alone, and it reaches the Distribution with
 * no page for the viewer to be sent.
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
    const errorCachingMinTtlSec = this.errorCachingMinTtlSec(
      customErrorResponse.ErrorCachingMinTTL,
    );

    if (responsePagePath === undefined || responsePagePath === "") {
      if (responseCode !== undefined) {
        throw new SimCloudFrontInvalidArgument(
          `CloudFront CustomErrorResponse for ${String(errorCode)} has a ResponseCode without a ResponsePagePath`,
        );
      }

      distribution.addCustomErrorResponse({ errorCode, errorCachingMinTtlSec });

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
      errorCachingMinTtlSec,
      page: { responsePagePath, responseCode },
    });
  }

  /**
   * How long the rule holds its error for, which CloudFront defaults to ten
   * seconds.
   *
   * A template can write a number as a string, and that one is read as the
   * seconds it spells. Anything else falls back to the default. The
   * alternative would be a stack that fails to deploy over the seconds an
   * error is held for.
   */
  private errorCachingMinTtlSec(errorCachingMinTtl: unknown): number {
    const seconds =
      typeof errorCachingMinTtl === "string" && errorCachingMinTtl.trim() !== ""
        ? Number(errorCachingMinTtl)
        : errorCachingMinTtl;

    return typeof seconds === "number" &&
      Number.isFinite(seconds) &&
      seconds >= 0
      ? seconds
      : simCloudFrontDefaultErrorCachingMinTtlSec;
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
