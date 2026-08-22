/**
 * Read the request body as the prompt a rule is matched on.
 *
 * The body is the whole request in the shape the model behind the id expects,
 * and Bedrock reads nothing inside it, so neither does this. Matching on the
 * bytes as they arrived is the only thing this simulation can do without
 * knowing the model's own request shape, and a test matching a whole JSON body
 * usually wants a model rule instead.
 *
 * The SDK accepts a body in every shape a payload can arrive in. A body that
 * is a stream or a Blob has no prompt here, because reading it would consume
 * the caller's own request body. Such a request falls through to a model rule
 * or to the default.
 */
export function simBedrockInvokeModelPrompt(body: unknown): string | undefined {
  const text = decoded(body);

  return text === undefined || text.length === 0 ? undefined : text;
}

function decoded(body: unknown): string | undefined {
  if (typeof body === "string") {
    return body;
  }

  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    );
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  }

  return undefined;
}
