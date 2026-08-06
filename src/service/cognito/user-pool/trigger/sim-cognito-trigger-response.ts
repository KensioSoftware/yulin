import { SimCognitoInvalidLambdaResponseException } from "../../error/sim-cognito-trigger.error.js";
import type { SimCognitoTriggerName } from "./sim-cognito-trigger-name.js";

/**
 * Refuse what a Lambda trigger handler returned, unless it is the event it was
 * given.
 *
 * A trigger handler is handed the event and has to return it, changed or not.
 * Real Cognito reads the returned object rather than the one it sent, so a
 * handler that returns nothing has dropped the event, and one that returns
 * something without the `request` it was given has returned a different event.
 * Both are `InvalidLambdaResponseException` there and here.
 *
 * `response` is not checked. `PreSignUp` is the only trigger here that reads
 * anything out of it, and a handler that dropped it is read as having answered
 * no to all three of its flags, which is what a handler with nothing to ask for
 * means. Refusing a missing `response` would refuse handlers real Cognito
 * accepts.
 */
export function requireSimCognitoTriggerResponse(
  trigger: SimCognitoTriggerName,
  returned: unknown,
): void {
  if (
    typeof returned !== "object" ||
    returned === null ||
    Array.isArray(returned)
  ) {
    throw new SimCognitoInvalidLambdaResponseException(
      `The ${trigger} trigger returned ${describeReturned(returned)} rather ` +
        `than the event it was given. A trigger handler has to return the ` +
        `event, changed or not.`,
    );
  }

  if (!("request" in returned)) {
    throw new SimCognitoInvalidLambdaResponseException(
      `The ${trigger} trigger returned an object without a request, so it is ` +
        `not the event it was given. A trigger handler has to return the ` +
        `event, changed or not.`,
    );
  }
}

function describeReturned(returned: unknown): string {
  if (Array.isArray(returned)) {
    return "an array";
  }

  return returned === null ? "null" : typeof returned;
}
