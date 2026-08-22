import { SimBedrockCommandGroup } from "../sim-bedrock-command-group.js";
import type { SimBedrockRequestOptions } from "../sim-bedrock-request-options.js";
import { SimBedrockUnsimulatedInput } from "../sim-bedrock-unsimulated-input.js";
import type {
  SimInvokeModelCommand,
  SimInvokeModelCommandOutput,
} from "./invoke-model.command.js";
import { simBedrockInvokeModelPrompt } from "./sim-bedrock-invoke-model-prompt.js";

const operation = "InvokeModel";

const defaultContentType = "application/json";

/**
 * The inputs a simulated `InvokeModel` reads.
 *
 * `contentType` and `accept` are accepted and only the latter is used, to say
 * what the answer is labelled as. Everything a guardrail arrives through is
 * absent from this list and refused.
 */
const accepted = ["modelId", "body", "contentType", "accept"];

const unsimulated = new SimBedrockUnsimulatedInput(operation);

/**
 * Handles an InvokeModel command.
 *
 * The response body is the one declared for the request, serialized as JSON.
 * There is no built-in default: a response body is whatever shape the model
 * behind the id uses, and one family's shape served for every other family
 * would be an answer that parses and means nothing.
 */
export class SimBedrockInvokeModelHandler extends SimBedrockCommandGroup {
  /**
   * Invoke a model and answer with the body declared for the request.
   */
  handle(
    command: SimInvokeModelCommand,
    options?: SimBedrockRequestOptions,
  ): SimInvokeModelCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, accepted);

    const modelId = this.requireModelId(input.modelId, operation);

    this.authorizeModel(modelId, options);

    const prompt = simBedrockInvokeModelPrompt(input.body);
    const declared = this.responses.responseFor({ prompt, modelId });

    return {
      body: new TextEncoder().encode(JSON.stringify(declared.body())),
      contentType: input.accept ?? defaultContentType,
      $metadata: {},
    };
  }
}
