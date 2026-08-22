import { SimBedrockCommandGroup } from "../sim-bedrock-command-group.js";
import type { SimBedrockRequestOptions } from "../sim-bedrock-request-options.js";
import { SimBedrockUnsimulatedInput } from "../sim-bedrock-unsimulated-input.js";
import type {
  SimConverseCommand,
  SimConverseCommandOutput,
} from "./converse.command.js";
import { simBedrockConversePrompt } from "./sim-bedrock-converse-prompt.js";

const operation = "Converse";

/**
 * The inputs a simulated `Converse` reads or can honestly ignore.
 *
 * `system`, `inferenceConfig` and `additionalModelRequestFields` are accepted
 * and have no effect, because they change what a model generates and no model
 * generates anything here. `toolConfig` is accepted for the same reason: which
 * tools the model may call is decided by the declared response, which either
 * carries a tool use block or does not.
 */
const accepted = [
  "modelId",
  "messages",
  "system",
  "inferenceConfig",
  "toolConfig",
  "additionalModelRequestFields",
];

const unsimulated = new SimBedrockUnsimulatedInput(operation);

/**
 * Handles a Converse command.
 *
 * The response comes from the rule the request matches, and nothing in the
 * conversation is read for meaning. A prompt rule answers the exchange it was
 * declared for, a model rule answers every other call to that model, and a
 * request matching neither is answered with the default.
 */
export class SimBedrockConverseHandler extends SimBedrockCommandGroup {
  /**
   * Answer a conversation with the response declared for it.
   */
  handle(
    command: SimConverseCommand,
    options?: SimBedrockRequestOptions,
  ): SimConverseCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, accepted);

    const modelId = this.requireModelId(input.modelId, operation);
    const prompt = simBedrockConversePrompt(input.messages);

    this.authorizeModel(modelId, options);

    const declared = this.responses.responseFor({ prompt, modelId });

    return {
      output: { message: declared.message() },
      stopReason: declared.stopReason(),
      usage: declared.usage(),
      metrics: { latencyMs: 0 },
      $metadata: {},
    };
  }
}
