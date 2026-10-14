import { readSimSdkWireInput } from "./sim-sdk-wire-json.js";
import type { SimSdkWireRequest } from "./sim-sdk-wire.types.js";

/**
 * The Command input members `InvokeModel` and
 * `InvokeModelWithResponseStream` carry in headers, with the header each one
 * travels in. The two differ only in where they carry `accept`.
 *
 * Every one is read, including the ones the simulation refuses, so that a
 * request naming a guardrail is refused here as it is through an intercepted
 * client.
 */
const invokeHeaderMembers: readonly (readonly [string, string])[] = [
  ["contentType", "content-type"],
  ["trace", "x-amzn-bedrock-trace"],
  ["guardrailIdentifier", "x-amzn-bedrock-guardrailidentifier"],
  ["guardrailVersion", "x-amzn-bedrock-guardrailversion"],
  ["performanceConfigLatency", "x-amzn-bedrock-performanceconfig-latency"],
  ["serviceTier", "x-amzn-bedrock-service-tier"],
  ["requestMetadata", "x-amzn-bedrock-request-metadata"],
];

/**
 * `Converse` and `ConverseStream` send their input as the JSON body, less the
 * model id the path carries.
 */
export function simSdkWireConverseInput(
  modelId: string,
  request: SimSdkWireRequest,
): unknown {
  return { ...(readSimSdkWireInput(request.body) as object), modelId };
}

/**
 * The model invocations send the request body as it is, with every other
 * member in a header.
 */
export function simSdkWireInvokeInput(
  modelId: string,
  request: SimSdkWireRequest,
  acceptHeaderName: string,
): unknown {
  const members = [
    ...invokeHeaderMembers,
    ["accept", acceptHeaderName] as const,
  ].flatMap(([member, headerName]) => {
    // oxlint-disable-next-line security/detect-object-injection -- this module's own fixed header names.
    const value = request.headers[headerName];

    return value === undefined ? [] : [[member, value] as const];
  });

  return {
    ...Object.fromEntries(members),
    modelId,
    ...(request.body.byteLength > 0 && { body: request.body }),
  };
}
