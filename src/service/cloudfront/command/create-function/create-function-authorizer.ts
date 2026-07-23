import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimCloudFrontFunctionName } from "../../cff/sim-cloudfront-function.js";

interface CreateFunctionAuthorizerProperties {
  readonly accountId: SimAwsAccountId;
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a CloudFront CreateFunction request.
 *
 * The requested Function name is known before creation, so authorization uses
 * the Function ARN that CloudFront will assign if creation succeeds.
 */
export class CreateFunctionAuthorizer {
  private static readonly action = "cloudfront:CreateFunction";

  private readonly accountId: SimAwsAccountId;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: CreateFunctionAuthorizerProperties) {
    this.accountId = properties.accountId;
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may create the named CloudFront Function.
   */
  authorize(
    functionName: SimCloudFrontFunctionName | string,
    caller?: SimAwsCaller,
  ): void {
    const resource = `arn:aws:cloudfront::${this.accountId}:function/${functionName}`;
    const decision = this.iam.authorize({
      action: CreateFunctionAuthorizer.action,
      resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: CreateFunctionAuthorizer.action,
        resource,
      });
    }
  }
}
