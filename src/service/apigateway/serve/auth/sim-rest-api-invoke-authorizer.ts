import { SimLambdaServiceInvokeAuthorizer } from "../../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimRestApiAuthorizer } from "../../api/authorizer/sim-rest-api-authorizer.js";
import { SimRestApiExecuteApiArn } from "../../api/sim-rest-api-execute-api-arn.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import { simApiGatewayServicePrincipal } from "../../sim-api-gateway-service-principal.js";
import type { SimRestApiFunctionTarget } from "../sim-rest-api-function-target.js";

/**
 * Whether the API may not invoke a function as one of its authorizers.
 *
 * Whether a service may invoke a function is Lambda's own rule, so the
 * decision is made there. What this adds is the part only API Gateway knows,
 * which is what the function is being invoked for.
 *
 * The source ARN names the authorizer rather than any method, so a function
 * granted the invoke action for the API's methods is not thereby usable as its
 * authorizer, as on real AWS.
 */
export function simRestApiMayNotInvokeAuthorizer(
  restApi: SimRestApi,
  authorizer: SimRestApiAuthorizer,
  target: SimRestApiFunctionTarget,
): boolean {
  return new SimLambdaServiceInvokeAuthorizer({ iam: target.iam }).authorize({
    resource: target.resource,
    servicePrincipal: simApiGatewayServicePrincipal,
    sourceArn: SimRestApiExecuteApiArn.forAuthorizer(
      restApi,
      authorizer.authorizerId,
    ).toString(),
    sourceAccount: restApi.accountRegionScope.accountId,
  }).isDenied;
}
