import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface UpdateFunctionCodeAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda UpdateFunctionCode request.
 *
 * AWS maps the UpdateFunctionCode API operation to the
 * lambda:UpdateFunctionCode IAM action. The resource is the ARN of the
 * function whose code is being replaced.
 */
export class UpdateFunctionCodeAuthorizer {
  private static readonly action = "lambda:UpdateFunctionCode";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: UpdateFunctionCodeAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may replace the code of the function with the given ARN.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(functionArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: UpdateFunctionCodeAuthorizer.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: UpdateFunctionCodeAuthorizer.action,
        resource: functionArn,
      });
    }
  }
}
