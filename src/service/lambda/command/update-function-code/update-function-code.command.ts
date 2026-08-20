/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionCodeCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";

/**
 * Minimal structural sim Lambda UpdateFunctionCode command.
 */
export interface SimUpdateFunctionCodeCommand {
  readonly input: SimUpdateFunctionCodeCommandInput;
}

/**
 * Minimal structural sim Lambda UpdateFunctionCode input.
 *
 * The code members sit at the top level here, unlike CreateFunction, which
 * nests the same members under `Code`.
 *
 * Real Lambda takes a `RevisionId` and a `DryRun` to update only code the
 * caller has already seen, and `Architectures` and `SourceKMSKeyArn` to
 * describe how the code was built and encrypted. None of those are simulated,
 * so all four are left out rather than accepted and ignored.
 */
export interface SimUpdateFunctionCodeCommandInput {
  readonly FunctionName?: string | undefined;
  readonly ZipFile?: Uint8Array | undefined;
  readonly S3Bucket?: string | undefined;
  readonly S3Key?: string | undefined;
  readonly S3ObjectVersion?: string | undefined;
  readonly ImageUri?: string | undefined;
  readonly Publish?: boolean | undefined;
}

/**
 * Minimal structural sim Lambda UpdateFunctionCode output.
 *
 * The configuration is the updated function's, or the published version's
 * where `Publish` asked for one, as real Lambda answers.
 */
export interface SimUpdateFunctionCodeCommandOutput extends SimLambdaFunctionConfiguration {
  readonly $metadata: SimResponseMetadata;
}
