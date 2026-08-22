import type { SimBedrockResolvedResponse } from "../../response/sim-bedrock-resolved-response.js";
import type { SimBedrockStreamedBlock } from "../../response/sim-bedrock-streamed-content.js";
import type { SimConverseStreamOutput } from "./converse-stream.command.js";

/**
 * The arguments of a tool call with nothing declared for them.
 *
 * A real stream always sends JSON here, so an empty object is what a call
 * taking no arguments looks like.
 */
const noToolInput = "{}";

function toolInputOf(input: unknown): string {
  return input === undefined ? noToolInput : JSON.stringify(input);
}

function blockEvents(
  block: SimBedrockStreamedBlock,
  contentBlockIndex: number,
): readonly SimConverseStreamOutput[] {
  if (block.kind === "toolUse") {
    return [
      {
        contentBlockStart: {
          contentBlockIndex,
          start: { toolUse: block.toolUse },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex,
          delta: { toolUse: { input: toolInputOf(block.toolUse.input) } },
        },
      },
      { contentBlockStop: { contentBlockIndex } },
    ];
  }

  return [
    ...block.deltas.map((text) => ({
      contentBlockDelta: { contentBlockIndex, delta: { text } },
    })),
    { contentBlockStop: { contentBlockIndex } },
  ];
}

/**
 * The events one declared response arrives as over `ConverseStream`.
 *
 * The order is real Bedrock's: the message opens, each content block sends its
 * deltas and closes, the message closes with its stop reason, and the metadata
 * carrying the token counts comes last. Code accumulating a response reads the
 * same sequence here as it does in production.
 *
 * A text block opens with no event of its own, which is what real Bedrock
 * does. Only a tool call announces itself, because the caller needs its id and
 * name before the arguments arrive.
 */
export function simBedrockConverseStreamEvents(
  declared: SimBedrockResolvedResponse,
): readonly SimConverseStreamOutput[] {
  const blocks = declared.streamedContent();

  return [
    { messageStart: { role: "assistant" } },
    ...blocks.flatMap((block, index) => blockEvents(block, index)),
    { messageStop: { stopReason: declared.stopReason() } },
    {
      metadata: { usage: declared.usage(), metrics: { latencyMs: 0 } },
    },
  ];
}
