import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimBedrockResponseUsage } from "../../response/sim-bedrock-declared-usage.js";
import type { SimBedrockResponseMessage } from "../../response/sim-bedrock-resolved-response.js";

/**
 * One content block of a message a request carries.
 *
 * Only the text of a block is read, which is what the prompt a rule matches on
 * is made of. An image, a document or a tool result reaches the simulation
 * whole and is answered from the same rules.
 */
export interface SimBedrockRequestContentBlock {
  readonly text?: string | undefined;
}

/**
 * One message of the conversation a request carries.
 */
export interface SimBedrockRequestMessage {
  readonly role?: string | undefined;
  readonly content?: readonly SimBedrockRequestContentBlock[] | undefined;
}

/**
 * Minimal structural sim Bedrock Runtime Converse command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseCommand/
 */
export interface SimConverseCommand {
  readonly input: SimConverseCommandInput;
}

export interface SimConverseCommandInput {
  readonly modelId?: string | undefined;
  readonly messages?: readonly SimBedrockRequestMessage[] | undefined;
  readonly system?: unknown;
  readonly inferenceConfig?: unknown;
  readonly toolConfig?: unknown;
  readonly additionalModelRequestFields?: unknown;
}

export interface SimConverseOutput {
  readonly message: SimBedrockResponseMessage;
}

export interface SimConverseMetrics {
  readonly latencyMs: number;
}

export interface SimConverseCommandOutput {
  readonly output: SimConverseOutput;
  readonly stopReason: string;
  readonly usage: SimBedrockResponseUsage;
  readonly metrics: SimConverseMetrics;
  readonly $metadata: SimResponseMetadata;
}
