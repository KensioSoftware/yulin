/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/PutFunctionRecursionConfigCommand/
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionRecursionConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import { SimLambdaValidationException } from "../../error/sim-lambda.error.js";

/**
 * What a function does about a recursive loop: stop it, as by default, or let
 * it run.
 */
export type SimLambdaRecursiveLoop = "Allow" | "Terminate";

/**
 * Minimal structural sim Lambda PutFunctionRecursionConfig command.
 */
export interface SimPutFunctionRecursionConfigCommand {
  readonly input: {
    readonly FunctionName?: string | undefined;
    readonly RecursiveLoop?: string | undefined;
  };
}

/**
 * Minimal structural sim Lambda GetFunctionRecursionConfig command.
 */
export interface SimGetFunctionRecursionConfigCommand {
  readonly input: { readonly FunctionName?: string | undefined };
}

/**
 * Minimal structural output of both recursion config commands.
 */
export interface SimFunctionRecursionConfigCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly RecursiveLoop: SimLambdaRecursiveLoop;
}

/**
 * The recursive loop setting a request names, refusing anything but the two
 * real Lambda accepts.
 */
export function simLambdaRecursiveLoopIn(
  value: string | undefined,
): SimLambdaRecursiveLoop {
  if (value === "Allow" || value === "Terminate") {
    return value;
  }

  throw new SimLambdaValidationException(
    `1 validation error detected: Value '${String(value)}' at ` +
      "'recursiveLoop' failed to satisfy constraint: Member must satisfy " +
      "enum value set: [Allow, Terminate]",
  );
}
