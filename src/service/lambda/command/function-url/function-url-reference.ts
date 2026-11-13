import { SimLambdaValidationException } from "../../error/sim-lambda.error.js";
import {
  simLambdaQualifiedFunctionOf,
  type SimLambdaFunctionReference,
} from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";

/**
 * The qualifier pattern the Function URL commands document, which admits an
 * alias name and refuses a version number and `$LATEST`.
 */
const aliasQualifierPattern = /^(?!\d+$)[\w\-]+$/v;

/**
 * The same pattern as real Lambda writes it in a refusal.
 */
const aliasQualifierPatternText = String.raw`((?!^\d+$)^[0-9a-zA-Z-_]+$)`;

/**
 * The function and alias a Function URL command names, refusing a qualifier
 * that is not an alias name the way real Lambda refuses one.
 *
 * The function can be named by ARN, and a qualifier can be given either on the
 * name or as `Qualifier`.
 */
export function simLambdaFunctionUrlReference(
  functionName: string,
  qualifier: string | undefined,
): SimLambdaFunctionReference {
  const reference = simLambdaQualifiedFunctionOf(functionName, qualifier);

  if (
    reference.qualifier !== undefined &&
    !aliasQualifierPattern.test(reference.qualifier)
  ) {
    const constraint = `Member must satisfy regular expression pattern: ${aliasQualifierPatternText}`;

    throw new SimLambdaValidationException(
      `1 validation error detected: Value '${reference.qualifier}' at 'qualifier' failed to satisfy constraint: ${constraint}`,
    );
  }

  return reference;
}

/**
 * The function a Function URL command acts on, failing as AWS does when the
 * function, or the alias the command names, does not exist.
 */
export function simLambdaFunctionUrlOwner(
  functions: SimLambdaFunctionLookup,
  reference: SimLambdaFunctionReference,
): SimLambdaFunction {
  const simFunction = functions.require(reference.functionName);

  if (reference.qualifier !== undefined) {
    functions.requireTarget(reference.functionName, reference.qualifier);
  }

  return simFunction;
}
