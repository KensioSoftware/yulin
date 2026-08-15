import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaResourcePolicies } from "../../command/authorize/sim-lambda-resource-policies.js";
import {
  simLambdaFunctionUrlAuthTypeConditionKey,
  simLambdaSourceAccountConditionKey,
  simLambdaSourceArnConditionKey,
} from "../../function/policy/sim-lambda-permission.js";
import {
  simLambdaInvokeFunctionAction,
  simLambdaInvokeFunctionUrlAction,
  simLambdaUrlRequiresInvokeFunction,
} from "./sim-lambda-url-invoke-actions.js";
import type { SimAwsRequestSource } from "../../../iam/request/sim-aws-request-source.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionUrl } from "../../function/url/sim-lambda-function-url.js";

interface SimLambdaUrlAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimLambdaUrlAuthorizationInput {
  readonly simFunction: SimLambdaFunction;
  readonly functionUrl: SimLambdaFunctionUrl;
  readonly caller: SimAwsCaller;
  /**
   * The resource the request said it was made on behalf of, such as the
   * CloudFront Distribution reaching a Function URL Origin.
   */
  readonly source?: SimAwsRequestSource | undefined;
}

/**
 * Decides whether a caller may invoke a Function URL.
 *
 * The answer is a decision rather than a thrown error, because a refusal is an
 * ordinary HTTP outcome here: the endpoint answers 403 in the shape real Lambda
 * does, with nothing to propagate to a caller in process.
 *
 * Both sides of Lambda authorization are evaluated: the caller's identity
 * policies, and the function's own resource policy, which is the only thing
 * that can allow a principal from another Account.
 */
export class SimLambdaUrlAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimLambdaUrlAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Evaluate the actions reaching this Function URL takes.
   *
   * `lambda:InvokeFunctionUrl` is the one a caller signing its own request
   * needs. CloudFront reaching the URL through an origin access control needs
   * `lambda:InvokeFunction` on top of it, so a resource policy granting only
   * the URL action is refused here as real Lambda refuses it.
   *
   * Every action is judged against the same request, so a permission
   * conditioned on the Distribution applies to both.
   */
  authorize(
    input: SimLambdaUrlAuthorizationInput,
  ): SimIamAuthorizationDecision {
    const urlDecision = this.decide(simLambdaInvokeFunctionUrlAction, input);

    if (urlDecision.isDenied) {
      return urlDecision;
    }

    if (!simLambdaUrlRequiresInvokeFunction(input.caller)) {
      return urlDecision;
    }

    const invokeDecision = this.decide(simLambdaInvokeFunctionAction, input);

    if (invokeDecision.isDenied) {
      return invokeDecision;
    }

    return urlDecision;
  }

  /**
   * Evaluate one action for a caller against a Function URL.
   *
   * The URL's auth type is supplied as `lambda:FunctionUrlAuthType`, which is
   * what a grant conditions on in practice: a permission granted for `AWS_IAM`
   * should not also open a URL later switched to `NONE`.
   *
   * A request made on behalf of a resource supplies `AWS:SourceArn` and
   * `AWS:SourceAccount` with it, which is what the permission granting
   * `cloudfront.amazonaws.com` names its Distribution in. A request that states
   * no source supplies neither, so a permission conditioned on one does not
   * match rather than matching anything.
   */
  private decide(
    action: string,
    input: SimLambdaUrlAuthorizationInput,
  ): SimIamAuthorizationDecision {
    const { source } = input;

    return this.iam.authorize({
      action,
      resource: input.simFunction.arn,
      caller: input.caller,
      resourcePolicies: simLambdaResourcePolicies(input.simFunction),
      conditionContext: {
        [simLambdaFunctionUrlAuthTypeConditionKey]: input.functionUrl.authType,
        ...(source?.arn !== undefined && {
          [simLambdaSourceArnConditionKey]: source.arn,
        }),
        ...(source?.accountId !== undefined && {
          [simLambdaSourceAccountConditionKey]: source.accountId,
        }),
      },
    });
  }
}
