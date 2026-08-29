import { SimCloudFrontError } from "./sim-cloudfront.error.js";

/**
 * Simulated CloudFront NoSuchOriginRequestPolicy error.
 *
 * What CloudFront answers when a Behavior's `OriginRequestPolicyId` names no
 * origin request policy the account holds, at Distribution create or update
 * time rather than when a request first needs the policy.
 */
export class SimCloudFrontNoSuchOriginRequestPolicy extends SimCloudFrontError {
  public override readonly name = "NoSuchOriginRequestPolicy";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated CloudFront OriginRequestPolicyAlreadyExists error.
 *
 * CloudFront requires an origin request policy name to be unique within an
 * account, so a second policy claiming a name is refused rather than created.
 */
export class SimCloudFrontOriginRequestPolicyAlreadyExists extends SimCloudFrontError {
  public override readonly name = "OriginRequestPolicyAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}
