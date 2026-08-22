import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Bedrock Runtime InvokeModel command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/InvokeModelCommand/
 */
export interface SimInvokeModelCommand {
  readonly input: SimInvokeModelCommandInput;
}

export interface SimInvokeModelCommandInput {
  readonly modelId?: string | undefined;
  readonly body?: unknown;
  readonly contentType?: string | undefined;
  readonly accept?: string | undefined;
}

export interface SimInvokeModelCommandOutput {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly $metadata: SimResponseMetadata;
}
