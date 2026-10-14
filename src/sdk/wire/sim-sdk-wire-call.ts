import { readSimSdkWireBedrockCall } from "./sim-sdk-wire-bedrock.js";
import { readSimSdkWireInput } from "./sim-sdk-wire-json.js";
import { readSimSdkWireOperation } from "./sim-sdk-wire-operation.js";
import {
  simSdkWireErrorResponse,
  simSdkWireOutputResponse,
} from "./sim-sdk-wire-response.js";
import type {
  SimSdkWireRequest,
  SimSdkWireResponse,
} from "./sim-sdk-wire.types.js";

/**
 * One wire request read back into the Command it was serialized from, with
 * the protocol it came in to encode the answer in.
 */
export interface SimSdkWireCall {
  /** The SDK `config.serviceId` of the service the request is addressed to. */
  readonly serviceId: string;
  /** The SDK Command class name the request would have been sent as. */
  readonly commandName: string;

  /**
   * The Command input. Reading it can fail on a malformed body, and that
   * failure is the service's answer to the request, so it is read when the
   * operation runs.
   */
  input(): unknown;

  /** The response for an output the simulated operation answered with. */
  outputResponse(output: unknown): Promise<SimSdkWireResponse>;

  /** The response for an error the simulated operation refused with. */
  errorResponse(error: unknown): SimSdkWireResponse;
}

/**
 * Read a wire request as the Command it was serialized from.
 *
 * Returns undefined for a request no reader here understands. The AWS JSON
 * protocol services all name their operation in one header. Bedrock Runtime
 * speaks REST-JSON, with the operation and model in the path, and has a
 * reader of its own.
 */
export function readSimSdkWireCall(
  request: SimSdkWireRequest,
): SimSdkWireCall | undefined {
  return readSimSdkWireJsonCall(request) ?? readSimSdkWireBedrockCall(request);
}

/**
 * Read an AWS JSON protocol request, whose body is the Command input and
 * whose response echoes the protocol version it was sent with.
 */
function readSimSdkWireJsonCall(
  request: SimSdkWireRequest,
): SimSdkWireCall | undefined {
  const operation = readSimSdkWireOperation(request);
  if (operation === undefined) {
    return undefined;
  }

  const contentType = request.headers["content-type"];

  return {
    ...operation,
    input: () => readSimSdkWireInput(request.body),
    outputResponse: (output) =>
      Promise.resolve(simSdkWireOutputResponse(output, contentType)),
    errorResponse: (error) => simSdkWireErrorResponse(error, contentType),
  };
}
