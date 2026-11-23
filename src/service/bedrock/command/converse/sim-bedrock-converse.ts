import { SimBedrockCommandGroup } from "../sim-bedrock-command-group.js";
import type { SimBedrockRequestOptions } from "../sim-bedrock-request-options.js";
import { SimBedrockUnsimulatedInput } from "../sim-bedrock-unsimulated-input.js";
import { SimBedrockOutputFormat } from "./output/sim-bedrock-output-format.js";
import type {
  SimConverseCommand,
  SimConverseCommandOutput,
} from "./converse.command.js";
import {
  simBedrockConverseAccepted,
  simBedrockConversePrompt,
  simBedrockConverseSystem,
} from "./sim-bedrock-converse-prompt.js";

const operation = "Converse";

const unsimulated = new SimBedrockUnsimulatedInput(operation);

/**
 * Handles a Converse command.
 *
 * The response comes from the rule the request matches, and nothing in the
 * conversation is read for meaning. A prompt rule answers the exchange it was
 * declared for, a system rule answers every call carrying those instructions,
 * a model rule answers every other call to that model, and a request matching
 * none of them is answered with the default.
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

    unsimulated.refuseUnaccepted(input, simBedrockConverseAccepted);

    const modelId = this.requireModelId(input.modelId, operation);
    const prompt = simBedrockConversePrompt(input.messages, operation);
    const system = simBedrockConverseSystem(input.system);
    const outputFormat = SimBedrockOutputFormat.fromInput(
      input.outputConfig,
      operation,
    );

    this.authorizeModel(modelId, options);

    const declared = this.responses.responseFor({ prompt, system, modelId });

    outputFormat?.requireConforming(declared);

    return {
      output: { message: declared.message() },
      stopReason: declared.stopReason(),
      usage: declared.usage(),
      metrics: { latencyMs: 0 },
      $metadata: {},
    };
  }
}
