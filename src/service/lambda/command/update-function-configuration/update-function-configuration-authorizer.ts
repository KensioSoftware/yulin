import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface UpdateFunctionConfigurationAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda UpdateFunctionConfiguration request.
 *
 * AWS maps the UpdateFunctionConfiguration API operation to the
 * lambda:UpdateFunctionConfiguration IAM action. The resource is the ARN of
 * the function whose settings are changing.
 */
export class UpdateFunctionConfigurationAuthorizer {
  private static readonly action = "lambda:UpdateFunctionConfiguration";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: UpdateFunctionConfigurationAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may change the settings of the function with the given
   * ARN.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(functionArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: UpdateFunctionConfigurationAuthorizer.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: UpdateFunctionConfigurationAuthorizer.action,
        resource: functionArn,
      });
    }
  }
}
