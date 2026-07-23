import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface CreateTableAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a DynamoDB CreateTable request.
 *
 * AWS maps the CreateTable API operation to the dynamodb:CreateTable IAM
 * action. The resource is the table ARN being created.
 */
export class CreateTableAuthorizer {
  private static readonly action = "dynamodb:CreateTable";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: CreateTableAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may create a DynamoDB table with the given ARN.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(tableArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: CreateTableAuthorizer.action,
      resource: tableArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: CreateTableAuthorizer.action,
        resource: tableArn,
      });
    }
  }
}
