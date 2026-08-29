import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimIamPassRoleAuthorizer } from "../../../iam/authorize/pass-role/sim-iam-pass-role-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simLambdaServicePrincipal } from "../../sim-lambda-service-principal.js";

interface CreateFunctionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda CreateFunction request.
 *
 * AWS maps the CreateFunction API operation to the lambda:CreateFunction IAM
 * action. The resource is the function ARN being created.
 *
 * The execution role is a second question. Lambda keeps that Role and runs the
 * function as it later, so the caller is asked whether they may hand it over,
 * against the Role rather than the function. The create action is decided
 * first, which is the order the two answers come in on real AWS.
 */
export class CreateFunctionAuthorizer {
  private static readonly action = "lambda:CreateFunction";

  private readonly iam: SimIamInterServiceAuthZ;
  private readonly passRole: SimIamPassRoleAuthorizer;

  constructor(properties: CreateFunctionAuthorizerProperties) {
    this.iam = properties.iam;
    this.passRole = new SimIamPassRoleAuthorizer({
      iam: properties.iam,
      passedToService: simLambdaServicePrincipal,
    });
  }

  /**
   * Ensure the caller may create a Lambda function with the given ARN, and may
   * hand Lambda the execution role it names.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(functionArn: string, roleArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: CreateFunctionAuthorizer.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: CreateFunctionAuthorizer.action,
        resource: functionArn,
      });
    }

    this.passRole.authorize(roleArn, caller);
  }
}
