import type { SimBedrockResolvedResponse } from "../../response/sim-bedrock-resolved-response.js";

const defaultContentType = "application/json";

/**
 * The inputs a simulated model invocation reads.
 *
 * `contentType` and `accept` are accepted and only the latter is used, to say
 * what the answer is labelled as. Everything a guardrail arrives through is
 * absent from this list and refused. `InvokeModel` and
 * `InvokeModelWithResponseStream` take the same request, so they accept the
 * same inputs.
 */
export const simBedrockInvokeAccepted = [
  "modelId",
  "body",
  "contentType",
  "accept",
];

/**
 * The declared response body, serialized the way a caller reads it back.
 */
export function simBedrockInvokedBody(
  declared: SimBedrockResolvedResponse,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(declared.body()));
}

/**
 * What the answer is labelled as.
 */
export function simBedrockInvokedContentType(
  accept: string | undefined,
): string {
  return accept ?? defaultContentType;
}
