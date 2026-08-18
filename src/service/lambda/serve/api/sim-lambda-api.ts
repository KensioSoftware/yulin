import { SimRestJsonApiEndpoint } from "../../../../serve/http/api/rest-json/sim-rest-json-endpoint.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { simLambdaApiRoutes } from "./sim-lambda-api-routes.js";

/**
 * Serve the Lambda control plane to a client given an endpoint URL.
 *
 * This is what `aws lambda invoke` reaches, and what a container, a Python
 * application or a shell script reaches. Invoking a simulated function over
 * HTTP runs the same handler an in-process invoke runs, in the same
 * environment, and IAM authorizes it the same way.
 *
 * The operations served are the ones simulated Lambda implements. Anything
 * else is refused as `NotImplemented`, under that name rather than as an
 * unparseable response.
 */
export function simLambdaApiEndpoint(simAws: SimAws): SimRestJsonApiEndpoint {
  return new SimRestJsonApiEndpoint({
    simAws,
    serviceId: "Lambda",
    routes: simLambdaApiRoutes,
  });
}
