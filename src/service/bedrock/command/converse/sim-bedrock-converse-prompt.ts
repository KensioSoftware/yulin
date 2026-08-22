import { SimBedrockValidationException } from "../../error/sim-bedrock.error.js";
import type { SimBedrockRequestMessage } from "./converse.command.js";

const userRole = "user";

/**
 * The prompt a `Converse` request is matched on.
 *
 * It is the text of the last user message, which is the turn the model is
 * answering. Earlier turns are the conversation it is answering in, and a rule
 * keyed on the whole history would stop matching as soon as the conversation
 * grew by one exchange.
 *
 * A message carrying several text blocks joins them with a newline, in the
 * order they were sent. A message carrying none, such as one holding only a
 * tool result, has no prompt, and the request falls through to a model rule or
 * to the default.
 */
export function simBedrockConversePrompt(
  messages: readonly SimBedrockRequestMessage[] | undefined,
): string | undefined {
  if (messages === undefined || messages.length === 0) {
    throw new SimBedrockValidationException(
      "Converse needs at least one message to send to the model",
    );
  }

  const lastUserMessage = messages.findLast(
    (message) => message.role === userRole,
  );
  const text = (lastUserMessage?.content ?? [])
    .map((block) => block.text)
    .filter((block) => block !== undefined)
    .join("\n");

  return text.length === 0 ? undefined : text;
}
