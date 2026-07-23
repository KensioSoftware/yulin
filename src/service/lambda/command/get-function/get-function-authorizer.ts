import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface GetFunctionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda GetFunction request.
 *
 * AWS maps the GetFunction API operation to the lambda:GetFunction IAM
 * action. The resource is the function ARN being read.
 */
export class GetFunctionAuthorizer {
  private static readonly action = "lambda:GetFunction";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: GetFunctionAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the Lambda function with the given ARN.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(functionArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: GetFunctionAuthorizer.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: GetFunctionAuthorizer.action,
        resource: functionArn,
      });
    }
  }
}
