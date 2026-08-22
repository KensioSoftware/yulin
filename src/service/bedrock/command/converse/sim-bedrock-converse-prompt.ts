import { SimBedrockValidationException } from "../../error/sim-bedrock.error.js";
import type { SimBedrockRequestMessage } from "./converse.command.js";

const userRole = "user";

/**
 * The inputs a simulated conversation reads or can honestly ignore.
 *
 * `system`, `inferenceConfig` and `additionalModelRequestFields` are accepted
 * and have no effect, because they change what a model generates and no model
 * generates anything here. `toolConfig` is accepted for the same reason: which
 * tools the model may call is decided by the declared response, which either
 * carries a tool use block or leaves one out.
 *
 * `Converse` and `ConverseStream` take the same request, so they accept the
 * same inputs.
 */
export const simBedrockConverseAccepted = [
  "modelId",
  "messages",
  "system",
  "inferenceConfig",
  "toolConfig",
  "additionalModelRequestFields",
];

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
  operation: string,
): string | undefined {
  if (messages === undefined || messages.length === 0) {
    throw new SimBedrockValidationException(
      `${operation} needs at least one message to send to the model`,
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
