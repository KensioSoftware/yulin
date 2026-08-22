import { simSdkEventStream } from "../../../../sdk/index.js";
import { SimBedrockCommandGroup } from "../sim-bedrock-command-group.js";
import type { SimBedrockRequestOptions } from "../sim-bedrock-request-options.js";
import { SimBedrockUnsimulatedInput } from "../sim-bedrock-unsimulated-input.js";
import {
  simBedrockConverseAccepted,
  simBedrockConversePrompt,
} from "./sim-bedrock-converse-prompt.js";
import type {
  SimConverseStreamCommand,
  SimConverseStreamCommandOutput,
} from "./converse-stream.command.js";
import { simBedrockConverseStreamEvents } from "./sim-bedrock-converse-stream-events.js";

const operation = "ConverseStream";

const unsimulated = new SimBedrockUnsimulatedInput(operation);

/**
 * Handles a ConverseStream command.
 *
 * It answers from the rules `Converse` answers from, so a test declaring a
 * response covers both APIs and code moving from one to the other keeps its
 * declarations. What differs is the shape it arrives in.
 */
export class SimBedrockConverseStreamHandler extends SimBedrockCommandGroup {
  /**
   * Stream the response declared for a conversation.
   */
  handle(
    command: SimConverseStreamCommand,
    options?: SimBedrockRequestOptions,
  ): SimConverseStreamCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, simBedrockConverseAccepted);

    const modelId = this.requireModelId(input.modelId, operation);
    const prompt = simBedrockConversePrompt(input.messages, operation);

    this.authorizeModel(modelId, options);

    const declared = this.responses.responseFor({ prompt, modelId });

    return {
      stream: simSdkEventStream(simBedrockConverseStreamEvents(declared)),
      $metadata: {},
    };
  }
}
