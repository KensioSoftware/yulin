import {
  simSdkWireBedrockActions,
  simSdkWireBedrockJsonContentType,
} from "./sim-sdk-wire-bedrock-action.js";
import type { SimSdkWireCall } from "./sim-sdk-wire-call.js";
import { readSimSdkWireCredentialScope } from "./sim-sdk-wire-operation.js";
import { simSdkWireErrorResponse } from "./sim-sdk-wire-response.js";
import type { SimSdkWireRequest } from "./sim-sdk-wire.types.js";

/**
 * The SDK `config.serviceId` of a `BedrockRuntimeClient`.
 */
const bedrockRuntimeServiceId = "Bedrock Runtime";

/**
 * The SigV4 signing name Bedrock Runtime requests are signed with.
 */
const bedrockSigningName = "bedrock";

/**
 * The path of a model invocation: `/model/{modelId}/{action}`, where the
 * model id is URL-encoded and may be a whole ARN.
 */
const invocationPathPattern =
  /^\/model\/(?<modelId>[^/]+)\/(?<action>[a-z-]+)$/;

/**
 * Read a Bedrock Runtime model invocation, which names its operation and its
 * model in the path rather than in a header.
 *
 * A request counts as one when it was signed for Bedrock, or, unsigned, sent
 * to a Bedrock Runtime endpoint, and its path is a model invocation.
 */
export function readSimSdkWireBedrockCall(
  request: SimSdkWireRequest,
): SimSdkWireCall | undefined {
  const signingName = readSimSdkWireCredentialScope(request)?.signingName;
  const isBedrock =
    signingName === undefined
      ? request.hostname.startsWith("bedrock-runtime.")
      : signingName === bedrockSigningName;
  if (!isBedrock || request.method.toUpperCase() !== "POST") {
    return undefined;
  }

  const groups = invocationPathPattern.exec(
    request.path.split("?", 1)[0] ?? "",
  )?.groups;
  const action = simSdkWireBedrockActions.get(groups?.["action"] ?? "");
  if (groups === undefined || action === undefined) {
    return undefined;
  }

  const modelId = decodeURIComponent(groups["modelId"] ?? "");

  return {
    serviceId: bedrockRuntimeServiceId,
    commandName: action.commandName,
    input: () => action.input(modelId, request),
    outputResponse: async (output) => await action.outputResponse(output),
    errorResponse: (error) =>
      simSdkWireErrorResponse(error, simSdkWireBedrockJsonContentType),
  };
}
