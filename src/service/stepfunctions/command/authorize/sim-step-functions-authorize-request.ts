import type { SimStepFunctionsRequestOptions } from "../sim-step-functions-request-options.js";
import type { SimStepFunctionsAuthorizer } from "./sim-step-functions-authorizer.js";

/**
 * Ensure the caller may perform an action on the resource a request names.
 *
 * A request naming no resource is left to the command, which refuses it as
 * invalid before IAM is reached.
 */
export function simStatesAuthorizeRequest(
  authorizer: SimStepFunctionsAuthorizer,
  action: string,
  resource: string | undefined,
  options?: SimStepFunctionsRequestOptions,
): void {
  if (resource !== undefined) {
    authorizer.authorizeStateMachineArn(action, resource, options?.caller);
  }
}
