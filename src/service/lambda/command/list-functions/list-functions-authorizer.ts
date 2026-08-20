import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface ListFunctionsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda ListFunctions request.
 *
 * AWS maps the ListFunctions API operation to the lambda:ListFunctions IAM
 * action. The operation reaches every function in the Account and Region, so
 * AWS documents its resource as "*" rather than any one function ARN.
 *
 * Authorization therefore applies to the whole operation. A denied caller
 * receives AccessDenied rather than a filtered listing.
 */
export class ListFunctionsAuthorizer {
  private static readonly action = "lambda:ListFunctions";
  private static readonly resource = "*";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: ListFunctionsAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may list the simulated Account's Lambda functions.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: ListFunctionsAuthorizer.action,
      resource: ListFunctionsAuthorizer.resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: ListFunctionsAuthorizer.action,
        resource: ListFunctionsAuthorizer.resource,
      });
    }
  }
}
