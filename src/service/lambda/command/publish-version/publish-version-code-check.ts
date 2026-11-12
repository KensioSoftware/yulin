import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";

/**
 * Refuse to publish a function whose code has moved on from the `CodeSha256`
 * a PublishVersion request names, as real Lambda refuses it.
 */
export function simLambdaAssertPublishedCode(
  simFunction: SimLambdaFunction,
  codeSha256: string | undefined,
): void {
  const { sha256 } = simFunction.codePackage;

  if (codeSha256 !== undefined && codeSha256 !== sha256) {
    throw new SimLambdaInvalidParameterValueException(
      `CodeSHA256 (${codeSha256}) is different from current CodeSHA256 in ` +
        `$LATEST (${sha256}). Please try again with the CodeSHA256 in $LATEST.`,
    );
  }
}
