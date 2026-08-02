import type { SimPayload2Endpoint } from "../../../../serve/payload-2/sim-payload-2-endpoint.js";
import type { SimLambdaFunctionUrl } from "../../function/url/sim-lambda-function-url.js";

/**
 * Describe a Function URL as the endpoint a payload format 2.0 event names.
 *
 * A Function URL has no API Gateway resources behind it: real Lambda reports
 * the URL id as the API id and puts `$default` in both the route key and the
 * stage, whatever the request path was. There are no path parameters, because
 * there is no route pattern to capture them, and no stage variables, because
 * there is no stage to configure.
 */
export function simLambdaUrlEndpoint(
  functionUrl: SimLambdaFunctionUrl,
): SimPayload2Endpoint {
  return {
    apiId: functionUrl.urlId,
    domainName: functionUrl.hostname,
    domainPrefix: functionUrl.urlId,
    routeKey: "$default",
    stage: "$default",
  };
}
