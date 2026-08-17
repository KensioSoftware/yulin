import { SimSdkUnbridgedWireRequestError } from "../error/sim-sdk.error.js";
import { readSimSdkWireCredentialScope } from "./sim-sdk-wire-operation.js";
import type { SimSdkWireRequest } from "./sim-sdk-wire.types.js";

/**
 * Explain a serialized AWS API request the simulation cannot route.
 *
 * The message names the service, because the reason is always the service:
 * either it speaks a protocol whose requests cannot be read back into a
 * Command without the operation's schema, or the simulator has no simulated
 * version of it. A signed request says which service it is for in its
 * credential scope; an unsigned one is left to say so with its endpoint.
 *
 * Saying it plainly is the whole point of raising this. The alternative is an
 * SDK reporting that it could not find credentials, or waiting on an endpoint
 * that nothing answers, neither of which is about what actually went wrong.
 */
export function simSdkUnbridgedWireRequest(
  request: SimSdkWireRequest,
): SimSdkUnbridgedWireRequestError {
  const service =
    readSimSdkWireCredentialScope(request)?.signingName ?? request.hostname;

  return new SimSdkUnbridgedWireRequestError(
    `Cannot answer a request to ${service} from the simulation: a ` +
      "serialized AWS API request can only be routed for a service using " +
      "the AWS JSON protocol. Where this is an AWS SDK bundled into " +
      "function code, leaving the SDK out of the deployment package puts it " +
      "back on the module interception path, which every simulated service " +
      "is reachable through.",
  );
}
