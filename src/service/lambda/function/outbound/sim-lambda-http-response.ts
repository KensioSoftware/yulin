import { STATUS_CODES } from "node:http";
import { Readable } from "node:stream";

/**
 * What an HTTP client library reads off a response.
 */
export interface SimLambdaHttpResponseMessage extends Readable {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
}

/**
 * Present a simulated response as the incoming message an HTTP client reads.
 *
 * The body is read in full before the message is built, because a client
 * reading an incoming message expects to be handed the stream rather than a
 * promise of one.
 */
export async function simLambdaHttpResponseMessage(
  response: Response,
): Promise<SimLambdaHttpResponseMessage> {
  const body = Buffer.from(await response.arrayBuffer());
  const message = Readable.from([body], {
    objectMode: false,
  }) as SimLambdaHttpResponseMessage;

  message.statusCode = response.status;
  message.statusMessage =
    response.statusText === ""
      ? (STATUS_CODES[response.status] ?? "")
      : response.statusText;
  message.headers = Object.fromEntries(response.headers);

  return message;
}
