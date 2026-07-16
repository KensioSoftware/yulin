import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface ListTablesAuthorizerProps {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a DynamoDB ListTables request.
 *
 * AWS maps the ListTables API operation to the dynamodb:ListTables IAM action.
 * This is a list operation whose authorization resource is "*", rather than an
 * individual table ARN.
 *
 * Authorization applies to the complete operation. A denied caller receives
 * AccessDenied rather than an empty or filtered table listing.
 */
export class ListTablesAuthorizer {
  private static readonly action = "dynamodb:ListTables";
  private static readonly resource = "*";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(props: ListTablesAuthorizerProps) {
    this.iam = props.iam;
  }

  /**
   * Ensure the caller may list the simulated Account and Region's tables.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: ListTablesAuthorizer.action,
      resource: ListTablesAuthorizer.resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: ListTablesAuthorizer.action,
        resource: ListTablesAuthorizer.resource,
      });
    }
  }
}
