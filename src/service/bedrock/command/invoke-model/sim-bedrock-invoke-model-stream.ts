import { simSdkEventStream } from "../../../../sdk/index.js";
import { SimBedrockCommandGroup } from "../sim-bedrock-command-group.js";
import type { SimBedrockRequestOptions } from "../sim-bedrock-request-options.js";
import { SimBedrockUnsimulatedInput } from "../sim-bedrock-unsimulated-input.js";
import type {
  SimInvokeModelWithResponseStreamCommand,
  SimInvokeModelWithResponseStreamCommandOutput,
} from "./invoke-model.command.js";
import { simBedrockInvokeModelPrompt } from "./sim-bedrock-invoke-model-prompt.js";
import {
  simBedrockInvokeAccepted,
  simBedrockInvokedBody,
  simBedrockInvokedContentType,
} from "./sim-bedrock-invoked-body.js";

const operation = "InvokeModelWithResponseStream";

const unsimulated = new SimBedrockUnsimulatedInput(operation);

/**
 * Handles an InvokeModelWithResponseStream command.
 *
 * The declared body arrives in one chunk. Real Bedrock sends a chunk per
 * generated fragment, in the shape the model behind the id uses, and splitting
 * a declared body into fragments means knowing that shape well enough to cut
 * it up. A caller accumulating chunks reads the same bytes either way.
 */
export class SimBedrockInvokeModelStreamHandler extends SimBedrockCommandGroup {
  /**
   * Stream the body declared for an invocation.
   */
  handle(
    command: SimInvokeModelWithResponseStreamCommand,
    options?: SimBedrockRequestOptions,
  ): SimInvokeModelWithResponseStreamCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, simBedrockInvokeAccepted);

    const modelId = this.requireModelId(input.modelId, operation);

    this.authorizeModel(modelId, options);

    const prompt = simBedrockInvokeModelPrompt(input.body);
    const declared = this.responses.responseFor({ prompt, modelId });

    return {
      body: simSdkEventStream([
        { chunk: { bytes: simBedrockInvokedBody(declared) } },
      ]),
      contentType: simBedrockInvokedContentType(input.accept),
      $metadata: {},
    };
  }
}
