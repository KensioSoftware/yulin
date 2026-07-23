import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface CreateFunctionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda CreateFunction request.
 *
 * AWS maps the CreateFunction API operation to the lambda:CreateFunction IAM
 * action. The resource is the function ARN being created.
 */
export class CreateFunctionAuthorizer {
  private static readonly action = "lambda:CreateFunction";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: CreateFunctionAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may create a Lambda function with the given ARN.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(functionArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: CreateFunctionAuthorizer.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: CreateFunctionAuthorizer.action,
        resource: functionArn,
      });
    }
  }
}
