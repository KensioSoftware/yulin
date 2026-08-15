import { SimCloudFrontInvalidOriginAccessControl } from "../error/sim-cloudfront.error.js";
import type {
  SimCloudFrontOriginAccessControl,
  SimCloudFrontOriginAccessControlOriginType,
} from "./sim-cf-origin-access-control.js";

/**
 * The Origin an origin type belongs on, as a refusal names it.
 *
 * An `s3` origin access control signs an S3 Bucket read, and a `lambda` one
 * signs a request to a Lambda Function URL, which is reached over HTTP and so
 * is a custom Origin.
 */
function originDescription(
  originType: SimCloudFrontOriginAccessControlOriginType,
): string {
  switch (originType) {
    case "s3": {
      return "S3 Origin";
    }
    case "lambda": {
      return "custom Origin";
    }
  }
}

/**
 * Refuse an origin access control whose origin type is not the one the Origin
 * it was named on needs.
 *
 * CloudFront refuses that pairing, and it is worth reproducing: an origin
 * access control signing for an S3 Bucket signs nothing a Function URL will
 * admit, so a template pairing them wrongly would otherwise deploy here and
 * fail on the real deployment.
 */
export function assertSimCfOacOriginType(
  originId: string,
  originType: SimCloudFrontOriginAccessControlOriginType,
  originAccessControl: SimCloudFrontOriginAccessControl | undefined,
): void {
  if (
    originAccessControl === undefined ||
    originAccessControl.originType === originType
  ) {
    return;
  }

  throw new SimCloudFrontInvalidOriginAccessControl(
    `Sim CloudFront ${originDescription(originType)} ${originId} names ` +
      `origin access control ${originAccessControl.name}, whose origin type ` +
      `is ${originAccessControl.originType} rather than ${originType}`,
  );
}
