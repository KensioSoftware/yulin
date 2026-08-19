import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimHttpApiRequestAuthorizer } from "../../api/authorizer/sim-http-api-request-authorizer.js";
import { SimHttpApiExecuteApiArn } from "../../api/sim-http-api-execute-api-arn.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import type { SimHttpApiFunctionTarget } from "../sim-http-api-function-target.js";

/**
 * The service principal API Gateway invokes a Lambda function as, whether that
 * function is behind an integration or behind an authorizer.
 */
export const simApiGatewayServicePrincipal = "apigateway.amazonaws.com";

interface SimHttpApiInvokeAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimHttpApiInvokeAuthorizationInput {
  readonly api: SimHttpApi;
  /** The function to invoke, and the resource the grant was made on. */
  readonly target: SimHttpApiFunctionTarget;
  readonly sourceArn: SimHttpApiExecuteApiArn;
}

/**
 * Decides whether an HTTP API may invoke one of its Lambda functions.
 *
 * A Lambda proxy integration created through CloudFormation, the CLI or an SDK
 * does not work until the function's resource policy allows
 * `apigateway.amazonaws.com` to invoke it, and a Lambda `REQUEST` authorizer's
 * function needs the same grant under an ARN of its own.
 *
 * Whether a service may invoke a function is Lambda's own rule, so the decision
 * is made there. What this adds is the part only API Gateway knows: which API
 * is calling, and what it is calling for.
 *
 * The answer is a decision rather than a thrown error, because a refusal is an
 * ordinary HTTP outcome: the endpoint answers 500 the way real API Gateway
 * does, with nothing to propagate to a caller in process.
 */
export class SimHttpApiInvokeAuthorizer {
  private readonly lambdaAuthorizer: SimLambdaServiceInvokeAuthorizer;

  constructor(properties: SimHttpApiInvokeAuthorizerProperties) {
    this.lambdaAuthorizer = new SimLambdaServiceInvokeAuthorizer({
      iam: properties.iam,
    });
  }

  /**
   * Evaluate `lambda:InvokeFunction` for the API against the function.
   *
   * What the API is invoking the function for is supplied as `AWS:SourceArn`,
   * so a permission granted for one route does not open another, and a
   * permission granted for an integration does not make the same function
   * usable as an authorizer. The API's own Account is supplied as
   * `AWS:SourceAccount`, which is the Account the source ARN names rather than
   * the one owning the function.
   *
   * A URI ending in a version or an alias is decided against that resource and
   * its own policy. An integration on `orders:live` needs a grant made on
   * `live`.
   */
  authorize(
    input: SimHttpApiInvokeAuthorizationInput,
  ): SimIamAuthorizationDecision {
    return this.lambdaAuthorizer.authorize({
      resource: input.target.resource,
      servicePrincipal: simApiGatewayServicePrincipal,
      sourceArn: input.sourceArn.toString(),
      sourceAccount: input.api.accountRegionScope.accountId,
    });
  }
}

/**
 * Whether the API may not invoke a function as one of its authorizers.
 *
 * The source ARN names the authorizer rather than the route, so a function
 * granted the invoke action for the API's routes is not thereby usable as its
 * authorizer, as on real AWS.
 */
export function simHttpApiMayNotInvokeAuthorizer(
  api: SimHttpApi,
  authorizer: SimHttpApiRequestAuthorizer,
  target: SimHttpApiFunctionTarget,
): boolean {
  return new SimHttpApiInvokeAuthorizer({ iam: target.iam }).authorize({
    api,
    target,
    sourceArn: SimHttpApiExecuteApiArn.forAuthorizer(
      api,
      authorizer.authorizerId,
    ),
  }).isDenied;
}
