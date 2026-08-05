import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda DeleteFunction command.
 */
export interface SimDeleteFunctionCommand {
  readonly input: SimDeleteFunctionCommandInput;
}

/**
 * Minimal structural sim Lambda DeleteFunction input.
 */
export interface SimDeleteFunctionCommandInput {
  readonly FunctionName?: string | undefined;
}

/**
 * Minimal structural sim Lambda DeleteFunction output.
 *
 * Real Lambda answers a successful DeleteFunction with 204 No Content, so
 * there is nothing in the body to model.
 */
export interface SimDeleteFunctionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
