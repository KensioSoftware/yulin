import type {
  SimBedrockDeclaredContentBlock,
  SimBedrockDeclaredResponse,
  SimBedrockDeclaredToolUse,
} from "./sim-bedrock-response-declaration.js";

/**
 * One text block of a streamed response, and the deltas it arrives in.
 *
 * A block declared as chunks streams one delta each. Any other text block
 * streams as a single delta. Splitting text into plausible token deltas would
 * invent behaviour no test could rely on, since the split a real model streams
 * comes from its own tokenizer.
 */
export interface SimBedrockStreamedTextBlock {
  readonly kind: "text";
  readonly deltas: readonly string[];
}

/**
 * One tool call of a streamed response.
 *
 * Real `ConverseStream` opens the block, streams the arguments as fragments of
 * JSON and closes it. The fragments are the part this leaves out: the
 * arguments arrive in one delta, because a declaration holds them whole.
 */
export interface SimBedrockStreamedToolUseBlock {
  readonly kind: "toolUse";
  readonly toolUse: SimBedrockDeclaredToolUse;
}

export type SimBedrockStreamedBlock =
  | SimBedrockStreamedTextBlock
  | SimBedrockStreamedToolUseBlock;

function streamedBlock(
  block: SimBedrockDeclaredContentBlock,
): SimBedrockStreamedBlock {
  if (block.toolUse !== undefined) {
    return { kind: "toolUse", toolUse: block.toolUse };
  }

  return { kind: "text", deltas: [block.text ?? ""] };
}

/**
 * How a declared response arrives over `ConverseStream`.
 *
 * The blocks are the ones `Converse` answers with, in the same order. Only the
 * deltas differ, and only for a response declared as chunks.
 */
export function simBedrockStreamedContent(
  declared: SimBedrockDeclaredResponse,
  content: readonly SimBedrockDeclaredContentBlock[],
): readonly SimBedrockStreamedBlock[] {
  const { chunks } = declared;

  if (chunks !== undefined) {
    return [{ kind: "text", deltas: chunks }];
  }

  return content.map((block) => streamedBlock(block));
}
