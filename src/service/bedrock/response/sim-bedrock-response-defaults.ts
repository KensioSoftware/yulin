import type { SimBedrockDeclaredResponse } from "./sim-bedrock-response-declaration.js";

/**
 * The text an undeclared `Converse` call answers with.
 *
 * It says what it is. A default that reads like a real model answer would be
 * asserted on by a test that meant to declare one, and the assertion would
 * pass for the wrong reason.
 */
export const simBedrockDefaultText =
  "This is a simulated Amazon Bedrock model response.";

/**
 * The stop reason a response reports where the declaration named none.
 */
export const simBedrockDefaultStopReason = "end_turn";

/**
 * The token counts a response reports where the declaration named none.
 *
 * They are fixed. Counting the tokens in a prompt needs the tokenizer of the
 * model the request names, and simulated Bedrock runs no model. A test that
 * asserts on a count declares one.
 */
export const simBedrockDefaultInputTokens = 12;
export const simBedrockDefaultOutputTokens = 24;

/**
 * What a `Converse` call answers with where no rule matches it.
 *
 * There is no equivalent for `InvokeModel`. Its response body is whatever
 * shape the model behind the id uses, and a default would be one model
 * family's shape served for every other one.
 */
export const simBedrockDefaultResponse: SimBedrockDeclaredResponse = {
  text: simBedrockDefaultText,
};
