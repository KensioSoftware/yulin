import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimCloudFrontFunctionName } from "../../cff/sim-cloudfront-function.js";

interface DeleteFunctionAuthorizerProperties {
  readonly accountId: SimAwsAccountId;
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a CloudFront DeleteFunction request.
 *
 * Authorization is against the Function ARN, and happens before the Function
 * map is read, so an unauthorized caller gets AccessDenied whether the
 * Function exists or not.
 */
export class DeleteFunctionAuthorizer {
  private static readonly action = "cloudfront:DeleteFunction";

  private readonly accountId: SimAwsAccountId;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: DeleteFunctionAuthorizerProperties) {
    this.accountId = properties.accountId;
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may delete the named CloudFront Function.
   */
  authorize(
    functionName: SimCloudFrontFunctionName | string,
    caller?: SimAwsCaller,
  ): void {
    const resource = `arn:aws:cloudfront::${this.accountId}:function/${functionName}`;
    const decision = this.iam.authorize({
      action: DeleteFunctionAuthorizer.action,
      resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: DeleteFunctionAuthorizer.action,
        resource,
      });
    }
  }
}
