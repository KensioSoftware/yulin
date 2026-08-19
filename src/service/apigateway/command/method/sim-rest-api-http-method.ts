import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import { simRestApiAnyMethod } from "../../api/method/sim-rest-api-method.js";

/**
 * The HTTP methods a REST API method can be declared for, plus `ANY`, which
 * covers every method the resource declares no method of its own for.
 */
const declarableMethods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  simRestApiAnyMethod,
];

/**
 * Read the HTTP method a command declares or addresses.
 *
 * Real API Gateway takes the method uppercased, and refuses one it does not
 * recognise. Accepting a lowercase spelling here would leave a method nothing
 * routes to, since a served request is matched against the uppercase form.
 */
export function simRestApiHttpMethodOf(
  operation: string,
  httpMethod: string,
): string {
  if (declarableMethods.includes(httpMethod)) {
    return httpMethod;
  }

  throw new SimApiGatewayBadRequest(
    `${operation} httpMethod '${httpMethod}' is invalid. It must be one of ` +
      `${declarableMethods.join(", ")}.`,
  );
}
