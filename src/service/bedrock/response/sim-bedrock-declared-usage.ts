import { SimBedrockDeclarationError } from "../error/sim-bedrock.error.js";
import type { SimBedrockDeclaredResponse } from "./sim-bedrock-response-declaration.js";
import {
  simBedrockDefaultInputTokens,
  simBedrockDefaultOutputTokens,
} from "./sim-bedrock-response-defaults.js";

/**
 * The token counts one response reports.
 */
export interface SimBedrockResponseUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

function countOf(
  subject: string,
  name: string,
  count: number | undefined,
  fallback: number,
): number {
  if (count === undefined) {
    return fallback;
  }

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new SimBedrockDeclarationError(
      `The response declared for ${subject} reports ${count} ${name}. A ` +
        `token count is a whole number of tokens and never negative.`,
    );
  }

  return count;
}

/**
 * The token counts a declared response reports, with the built-in figures
 * standing in for the ones it left out.
 *
 * Counting the tokens in a prompt needs the tokenizer of the model the request
 * names, and simulated Bedrock runs no model. A test asserting on a count
 * declares one.
 */
export function simBedrockDeclaredUsage(
  subject: string,
  declared: SimBedrockDeclaredResponse,
): SimBedrockResponseUsage {
  const { usage } = declared;
  const inputTokens = countOf(
    subject,
    "input tokens",
    usage?.inputTokens,
    simBedrockDefaultInputTokens,
  );
  const outputTokens = countOf(
    subject,
    "output tokens",
    usage?.outputTokens,
    simBedrockDefaultOutputTokens,
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}
