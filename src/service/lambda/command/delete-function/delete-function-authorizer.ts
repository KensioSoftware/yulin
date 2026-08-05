import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface DeleteFunctionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda DeleteFunction request.
 *
 * AWS maps the DeleteFunction API operation to the lambda:DeleteFunction IAM
 * action. The resource is the function ARN being deleted.
 */
export class DeleteFunctionAuthorizer {
  private static readonly action = "lambda:DeleteFunction";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: DeleteFunctionAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may delete the Lambda function with the given ARN.
   */
  authorize(functionArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: DeleteFunctionAuthorizer.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: DeleteFunctionAuthorizer.action,
        resource: functionArn,
      });
    }
  }
}
