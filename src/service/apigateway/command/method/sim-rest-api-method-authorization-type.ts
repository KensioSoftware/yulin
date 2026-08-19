import type { SimRestApiAuthorizationType } from "../../api/method/sim-rest-api-method.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import { simRestApiCognitoAuthorizationType } from "./sim-rest-api-method-authorizer-input.js";

/**
 * The authorization types real `PutMethod` takes but this simulation does not
 * build, and what a reader should know about each.
 */
const unsimulatedTypes = new Map([
  [
    "REQUEST",
    "a REQUEST authorizer receives the whole request, and that event is not " +
      "built here",
  ],
]);

/**
 * The authorization types `PutMethod` takes here, each of which something
 * enforces when a request reaches the method.
 */
const simulatedTypes = new Set<string>([
  "NONE",
  "CUSTOM",
  "AWS_IAM",
  simRestApiCognitoAuthorizationType,
]);

function isSimulatedType(
  declared: string,
): declared is SimRestApiAuthorizationType {
  return simulatedTypes.has(declared);
}

/**
 * The authorization type a `PutMethod` input asks for, refusing one this
 * simulation would leave open.
 *
 * Real `PutMethod` requires it, and defaulting an absent one to `NONE` here
 * would declare an open method for a request AWS rejects outright.
 */
export function simRestApiMethodAuthorizationType(
  declared: string | undefined,
): SimRestApiAuthorizationType {
  if (declared === undefined || declared.length === 0) {
    throw new SimApiGatewayBadRequest("PutMethod requires authorizationType");
  }

  if (isSimulatedType(declared)) {
    return declared;
  }

  const reason = unsimulatedTypes.get(declared);

  throw new SimApiGatewayBadRequest(
    `PutMethod authorizationType '${declared}' is not simulated` +
      `${reason === undefined ? "" : `: ${reason}`}. NONE, CUSTOM, AWS_IAM ` +
      `and ${simRestApiCognitoAuthorizationType} are supported.`,
  );
}
