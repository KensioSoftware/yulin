import type {
  SimHttpApiAuthorizer,
  SimHttpApiAuthorizerId,
} from "../../api/authorizer/sim-http-api-authorizer.js";
import type { SimCreateAuthorizerCommandInput } from "./authorizer.command.js";
import { SimHttpApiJwtAuthorizerInput } from "./sim-http-api-jwt-authorizer-input.js";
import { SimHttpApiRequestAuthorizerInput } from "./sim-http-api-request-authorizer-input.js";

/**
 * Reads one kind of authorizer out of a CreateAuthorizer input.
 *
 * The two kinds are configured by different halves of the same input, so each
 * reader states what its own kind requires and refuses what belongs to the
 * other, rather than the command handler knowing both.
 */
export interface SimHttpApiAuthorizerInput {
  read(authorizerId: SimHttpApiAuthorizerId): SimHttpApiAuthorizer;
}

/**
 * The reader for the kind of authorizer this input asks for.
 *
 * The type itself is checked by the command before this is reached, so
 * anything that is not `REQUEST` here is `JWT`.
 */
export function simHttpApiAuthorizerInput(
  input: SimCreateAuthorizerCommandInput,
): SimHttpApiAuthorizerInput {
  if (input.AuthorizerType === "REQUEST") {
    return new SimHttpApiRequestAuthorizerInput(input);
  }

  return new SimHttpApiJwtAuthorizerInput(input);
}
