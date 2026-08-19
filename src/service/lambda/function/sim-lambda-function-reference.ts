import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";

const functionArnSeparator = ":function:";

/**
 * The function a request named, and the version or alias qualifier that came
 * with it, if any.
 */
export interface SimLambdaFunctionReference {
  readonly functionName: string;
  readonly qualifier: string | undefined;
}

/**
 * Read the function and qualifier out of whatever names a function.
 *
 * Real Lambda takes four forms wherever a request names a function. The name
 * on its own, the name with a qualifier appended, a function ARN, and a
 * function ARN with a qualifier appended. All four end in the name and the
 * qualifier, so they are read the same way.
 */
export function simLambdaFunctionReferenceOf(
  functionNameOrArn: string,
): SimLambdaFunctionReference {
  const separatorIndex = functionNameOrArn.indexOf(functionArnSeparator);
  const nameAndQualifier =
    separatorIndex === -1
      ? functionNameOrArn
      : functionNameOrArn.slice(separatorIndex + functionArnSeparator.length);

  const qualifierIndex = nameAndQualifier.indexOf(":");

  return qualifierIndex === -1
    ? { functionName: nameAndQualifier, qualifier: undefined }
    : {
        functionName: nameAndQualifier.slice(0, qualifierIndex),
        qualifier: nameAndQualifier.slice(qualifierIndex + 1),
      };
}

/**
 * Read the function and version a request named, from the name it gave and
 * the qualifier it asked for.
 *
 * A request can qualify the function name, ask for a `Qualifier` of its own,
 * or do both. Real Lambda refuses a request that does both and disagrees with
 * itself, rather than picking one of the two.
 */
export function simLambdaQualifiedFunctionOf(
  functionNameOrArn: string,
  requestedQualifier: string | undefined,
): SimLambdaFunctionReference {
  const { functionName, qualifier } =
    simLambdaFunctionReferenceOf(functionNameOrArn);

  if (
    qualifier !== undefined &&
    requestedQualifier !== undefined &&
    qualifier !== requestedQualifier
  ) {
    throw new SimLambdaInvalidParameterValueException(
      "The derived qualifier from the function name does not match the specified qualifier.",
    );
  }

  return { functionName, qualifier: requestedQualifier ?? qualifier };
}

/**
 * The function a request names, refusing a qualifier the operation has no use
 * for.
 *
 * Publishing a version, listing versions and the alias operations all act on
 * the function itself. Dropping a qualifier there would act on something other
 * than what the caller named, so it is refused instead.
 */
export function simLambdaUnqualifiedFunctionOf(
  functionNameOrArn: string,
): string {
  const { functionName, qualifier } =
    simLambdaFunctionReferenceOf(functionNameOrArn);

  if (qualifier !== undefined) {
    throw new SimLambdaInvalidParameterValueException(
      `This operation is not permitted on a qualified function: ${functionNameOrArn}`,
    );
  }

  return functionName;
}
