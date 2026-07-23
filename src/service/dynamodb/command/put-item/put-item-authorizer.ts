import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface PutItemAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a DynamoDB PutItem request.
 *
 * AWS maps the PutItem API operation to the dynamodb:PutItem IAM action.
 * The resource is the ARN of the table being written to.
 */
export class PutItemAuthorizer {
  private static readonly action = "dynamodb:PutItem";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: PutItemAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may put an item into the DynamoDB table with the given ARN.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(tableArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: PutItemAuthorizer.action,
      resource: tableArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: PutItemAuthorizer.action,
        resource: tableArn,
      });
    }
  }
}
