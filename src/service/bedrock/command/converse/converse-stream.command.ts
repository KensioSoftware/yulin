import type { SimSdkEventStream } from "../../../../sdk/index.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimBedrockDeclaredToolUse } from "../../response/sim-bedrock-response-declaration.js";
import type { SimBedrockResponseUsage } from "../../response/sim-bedrock-declared-usage.js";
import type {
  SimConverseCommandInput,
  SimConverseMetrics,
} from "./converse.command.js";

/**
 * Minimal structural sim Bedrock Runtime ConverseStream command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseStreamCommand/
 */
export interface SimConverseStreamCommand {
  readonly input: SimConverseStreamCommandInput;
}

export type SimConverseStreamCommandInput = SimConverseCommandInput;

export interface SimBedrockMessageStartEvent {
  readonly role: "assistant";
}

export interface SimBedrockContentBlockStartEvent {
  readonly contentBlockIndex: number;
  readonly start: { readonly toolUse: SimBedrockDeclaredToolUse };
}

/**
 * What one delta carries.
 *
 * A text block sends its text. A tool call sends its arguments as the JSON a
 * real stream sends them in, in one delta rather than in fragments.
 */
export interface SimBedrockContentBlockDelta {
  readonly text?: string | undefined;
  readonly toolUse?: { readonly input: string } | undefined;
}

export interface SimBedrockContentBlockDeltaEvent {
  readonly contentBlockIndex: number;
  readonly delta: SimBedrockContentBlockDelta;
}

export interface SimBedrockContentBlockStopEvent {
  readonly contentBlockIndex: number;
}

export interface SimBedrockMessageStopEvent {
  readonly stopReason: string;
}

export interface SimBedrockStreamMetadataEvent {
  readonly usage: SimBedrockResponseUsage;
  readonly metrics: SimConverseMetrics;
}

/**
 * One event of a `ConverseStream` response.
 *
 * Each event names its own kind, as the SDK's own union does, so calling code
 * reads `event.contentBlockDelta` and gets nothing for every other kind.
 */
export interface SimConverseStreamOutput {
  readonly messageStart?: SimBedrockMessageStartEvent | undefined;
  readonly contentBlockStart?: SimBedrockContentBlockStartEvent | undefined;
  readonly contentBlockDelta?: SimBedrockContentBlockDeltaEvent | undefined;
  readonly contentBlockStop?: SimBedrockContentBlockStopEvent | undefined;
  readonly messageStop?: SimBedrockMessageStopEvent | undefined;
  readonly metadata?: SimBedrockStreamMetadataEvent | undefined;
}

export interface SimConverseStreamCommandOutput {
  readonly stream: SimSdkEventStream<SimConverseStreamOutput>;
  readonly $metadata: SimResponseMetadata;
}
