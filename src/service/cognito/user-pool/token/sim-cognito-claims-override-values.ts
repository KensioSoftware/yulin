import { isRecord } from "../../../../util/type-guard/record.js";
import { SimCognitoInvalidLambdaResponseException } from "../../error/sim-cognito-trigger.error.js";

/**
 * Refuse what a `PreTokenGeneration` handler wrote into its response.
 *
 * Every refusal reads as one sentence about the trigger, because that is what
 * the reader of the failure has to go and change: the handler, rather than
 * anything about the pool or the sign-in.
 */
export function refuseSimCognitoResponse(message: string): never {
  throw new SimCognitoInvalidLambdaResponseException(
    `The PreTokenGeneration trigger returned ${message}`,
  );
}

/**
 * One field of the response, which has to be an object.
 */
export function requireSimCognitoResponseObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    refuseSimCognitoResponse(`a ${field} that is not an object.`);
  }

  return value;
}

/**
 * One field of the response, which has to be a list of strings.
 *
 * A field that is not there at all asks for nothing, and answers with an empty
 * list rather than being refused: a handler naming only the claims it adds has
 * written a complete response.
 */
export function requireSimCognitoResponseStrings(
  value: unknown,
  field: string,
): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    refuseSimCognitoResponse(`a ${field} that is not a list.`);
  }

  const entries: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      refuseSimCognitoResponse(
        `a ${field} holding something that is not a string.`,
      );
    }

    entries.push(entry);
  }

  return entries;
}
