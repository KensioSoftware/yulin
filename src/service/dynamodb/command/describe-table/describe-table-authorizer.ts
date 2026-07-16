import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface DescribeTableAuthorizerProps {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a DynamoDB DescribeTable request.
 *
 * AWS maps the DescribeTable API operation to the dynamodb:DescribeTable IAM
 * action. The resource is the ARN of the table being described.
 */
export class DescribeTableAuthorizer {
  private static readonly action = "dynamodb:DescribeTable";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(props: DescribeTableAuthorizerProps) {
    this.iam = props.iam;
  }

  /**
   * Ensure the caller may describe the DynamoDB table with the given ARN.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(tableArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: DescribeTableAuthorizer.action,
      resource: tableArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: DescribeTableAuthorizer.action,
        resource: tableArn,
      });
    }
  }
}
