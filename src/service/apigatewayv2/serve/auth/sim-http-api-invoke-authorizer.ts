import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaResourcePolicies } from "../../../lambda/command/authorize/sim-lambda-resource-policies.js";
import type { SimLambdaFunction } from "../../../lambda/function/sim-lambda-function.js";
import type { SimHttpApiExecuteApiArn } from "../../api/sim-http-api-execute-api-arn.js";

/**
 * The service principal API Gateway invokes a Lambda function as, whether that
 * function is behind an integration or behind an authorizer.
 */
export const simApiGatewayServicePrincipal = "apigateway.amazonaws.com";

/**
 * The condition key the invoking API is supplied under, which is what an
 * `AddPermission` `SourceArn` is written against.
 */
const sourceArnConditionKey = "AWS:SourceArn";

interface SimHttpApiInvokeAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimHttpApiInvokeAuthorizationInput {
  readonly simFunction: SimLambdaFunction;
  readonly sourceArn: SimHttpApiExecuteApiArn;
}

/**
 * Decides whether an HTTP API may invoke one of its Lambda functions.
 *
 * A Lambda proxy integration created through CloudFormation, the CLI or an SDK
 * does not work until the function's resource policy allows
 * `apigateway.amazonaws.com` to invoke it, and a Lambda `REQUEST` authorizer's
 * function needs the same grant under an ARN of its own. API Gateway is the
 * caller, so the caller's own identity policies are not what admits the call:
 * a service principal owns none, and the function's resource policy is the
 * whole decision.
 *
 * The answer is a decision rather than a thrown error, because a refusal is an
 * ordinary HTTP outcome: the endpoint answers 500 the way real API Gateway
 * does, with nothing to propagate to a caller in process.
 */
export class SimHttpApiInvokeAuthorizer {
  private static readonly action = "lambda:InvokeFunction";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimHttpApiInvokeAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Evaluate `lambda:InvokeFunction` for the API against the function.
   *
   * What the API is invoking the function for is supplied as `AWS:SourceArn`,
   * so a permission granted for one route does not open another, and a
   * permission granted for an integration does not make the same function
   * usable as an authorizer.
   */
  authorize(
    input: SimHttpApiInvokeAuthorizationInput,
  ): SimIamAuthorizationDecision {
    return this.iam.authorize({
      action: SimHttpApiInvokeAuthorizer.action,
      resource: input.simFunction.arn,
      caller: { kind: "service", service: simApiGatewayServicePrincipal },
      resourcePolicies: simLambdaResourcePolicies(input.simFunction),
      conditionContext: {
        [sourceArnConditionKey]: input.sourceArn.toString(),
      },
    });
  }
}
