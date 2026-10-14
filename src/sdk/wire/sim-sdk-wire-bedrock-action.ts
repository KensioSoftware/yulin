import type { SimConverseStreamCommandOutput } from "../../service/bedrock/command/converse/converse-stream.command.js";
import type {
  SimInvokeModelCommandOutput,
  SimInvokeModelWithResponseStreamCommandOutput,
} from "../../service/bedrock/command/invoke-model/invoke-model.command.js";
import {
  simSdkWireConverseInput,
  simSdkWireInvokeInput,
} from "./sim-sdk-wire-bedrock-input.js";
import {
  simSdkWireEventStreamBody,
  simSdkWireEventStreamContentType,
} from "./sim-sdk-wire-event-stream.js";
import { simSdkWireOutputResponse } from "./sim-sdk-wire-response.js";
import type {
  SimSdkWireRequest,
  SimSdkWireResponse,
} from "./sim-sdk-wire.types.js";

/**
 * The REST-JSON content type, for bodies and for errors.
 */
export const simSdkWireBedrockJsonContentType = "application/json";

/**
 * How one Bedrock Runtime operation reads its input off a request and writes
 * its output back.
 */
export interface SimSdkWireBedrockAction {
  readonly commandName: string;
  input(modelId: string, request: SimSdkWireRequest): unknown;
  outputResponse(output: unknown): Promise<SimSdkWireResponse>;
}

/**
 * The invocation operations, keyed by the last segment of their path.
 */
export const simSdkWireBedrockActions: ReadonlyMap<
  string,
  SimSdkWireBedrockAction
> = new Map([
  [
    "converse",
    {
      commandName: "ConverseCommand",
      input: simSdkWireConverseInput,
      outputResponse: (output: unknown): Promise<SimSdkWireResponse> =>
        Promise.resolve(
          simSdkWireOutputResponse(output, simSdkWireBedrockJsonContentType),
        ),
    },
  ],
  [
    "converse-stream",
    {
      commandName: "ConverseStreamCommand",
      input: simSdkWireConverseInput,
      outputResponse: async (output: unknown): Promise<SimSdkWireResponse> =>
        await eventStreamResponse(
          (output as SimConverseStreamCommandOutput).stream,
          {},
        ),
    },
  ],
  [
    "invoke",
    {
      commandName: "InvokeModelCommand",
      input: (modelId: string, request: SimSdkWireRequest): unknown =>
        simSdkWireInvokeInput(modelId, request, "accept"),
      outputResponse: invokeModelResponse,
    },
  ],
  [
    "invoke-with-response-stream",
    {
      commandName: "InvokeModelWithResponseStreamCommand",
      input: (modelId: string, request: SimSdkWireRequest): unknown =>
        simSdkWireInvokeInput(modelId, request, "x-amzn-bedrock-accept"),
      outputResponse: async (output: unknown): Promise<SimSdkWireResponse> => {
        const { body, contentType } =
          output as SimInvokeModelWithResponseStreamCommandOutput;

        return await eventStreamResponse(body, {
          "x-amzn-bedrock-content-type": contentType,
        });
      },
    },
  ],
]);

/**
 * `InvokeModel` answers with the model's own body as it is, labelled with its
 * content type.
 */
function invokeModelResponse(output: unknown): Promise<SimSdkWireResponse> {
  const { body, contentType } = output as SimInvokeModelCommandOutput;

  return Promise.resolve({
    statusCode: 200,
    headers: { "content-type": contentType },
    body,
  });
}

/**
 * The streaming operations answer with an event stream body.
 */
async function eventStreamResponse(
  events: AsyncIterable<object>,
  headers: Readonly<Record<string, string>>,
): Promise<SimSdkWireResponse> {
  return {
    statusCode: 200,
    headers: { "content-type": simSdkWireEventStreamContentType, ...headers },
    body: await simSdkWireEventStreamBody(events),
  };
}
