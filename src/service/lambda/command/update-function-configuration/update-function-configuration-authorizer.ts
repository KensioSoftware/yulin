import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimIamPassRoleAuthorizer } from "../../../iam/authorize/pass-role/sim-iam-pass-role-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simLambdaServicePrincipal } from "../../sim-lambda-service-principal.js";

interface UpdateFunctionConfigurationAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Lambda UpdateFunctionConfiguration request.
 *
 * AWS maps the UpdateFunctionConfiguration API operation to the
 * lambda:UpdateFunctionConfiguration IAM action. The resource is the ARN of
 * the function whose settings are changing.
 *
 * A request changing the execution role hands Lambda a Role, and is asked
 * separately whether it may pass that one. A request leaving the role alone
 * passes nothing and is asked nothing.
 */
export class UpdateFunctionConfigurationAuthorizer {
  private static readonly action = "lambda:UpdateFunctionConfiguration";

  private readonly iam: SimIamInterServiceAuthZ;
  private readonly passRole: SimIamPassRoleAuthorizer;

  constructor(properties: UpdateFunctionConfigurationAuthorizerProperties) {
    this.iam = properties.iam;
    this.passRole = new SimIamPassRoleAuthorizer({
      iam: properties.iam,
      passedToService: simLambdaServicePrincipal,
    });
  }

  /**
   * Ensure the caller may change the settings of the function with the given
   * ARN, and may hand Lambda an execution role the request replaces it with.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(
    functionArn: string,
    roleArn: string | undefined,
    caller?: SimAwsCaller,
  ): void {
    const decision = this.iam.authorize({
      action: UpdateFunctionConfigurationAuthorizer.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: UpdateFunctionConfigurationAuthorizer.action,
        resource: functionArn,
      });
    }

    this.passRole.authorize(roleArn, caller);
  }
}
