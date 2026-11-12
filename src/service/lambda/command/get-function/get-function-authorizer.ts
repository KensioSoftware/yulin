import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface GetFunctionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  /**
   * The IAM action the read is authorized as. GetFunction and
   * GetFunctionConfiguration read the same function and differ only in this.
   */
  readonly action?: GetFunctionAuthorizerAction | undefined;
}

/**
 * The IAM actions that read a function's configuration.
 */
export type GetFunctionAuthorizerAction =
  | "lambda:GetFunction"
  | "lambda:GetFunctionConfiguration";

/**
 * Applies IAM authorization to a Lambda GetFunction request.
 *
 * AWS maps the GetFunction API operation to the lambda:GetFunction IAM
 * action, and GetFunctionConfiguration to lambda:GetFunctionConfiguration. The
 * resource is the function ARN being read.
 */
export class GetFunctionAuthorizer {
  private readonly action: GetFunctionAuthorizerAction;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: GetFunctionAuthorizerProperties) {
    this.iam = properties.iam;
    this.action = properties.action ?? "lambda:GetFunction";
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
      action: this.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: this.action,
        resource: functionArn,
      });
    }
  }
}
