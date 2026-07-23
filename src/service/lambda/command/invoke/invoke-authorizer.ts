import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface InvokeAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda Invoke request.
 *
 * AWS maps the Invoke API operation to the lambda:InvokeFunction IAM action.
 * The resource is the function ARN being invoked.
 */
export class InvokeAuthorizer {
  private static readonly action = "lambda:InvokeFunction";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: InvokeAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may invoke the Lambda function with the given ARN.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(functionArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: InvokeAuthorizer.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: InvokeAuthorizer.action,
        resource: functionArn,
      });
    }
  }
}
