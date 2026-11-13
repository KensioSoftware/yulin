import type { SimLambdaResponseStream } from "../../function/stream/sim-lambda-response-stream.js";

/**
 * The body, starting with what was written before the response was answered
 * and going on with each chunk the handler writes after.
 */
export function simLambdaUrlFollowedBody(
  stream: SimLambdaResponseStream,
  body: Buffer,
  invocation: Promise<unknown>,
): ReadableStream<Uint8Array> {
  let open = true;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const forward = (chunk: Buffer): void => {
    if (!open) {
      return;
    }
    controller?.enqueue(new Uint8Array(chunk));
  };
  const finish = (): void => {
    if (!open) {
      return;
    }
    open = false;
    controller?.close();
  };

  return new ReadableStream<Uint8Array>({
    start(started): void {
      controller = started;

      if (body.length > 0) {
        started.enqueue(new Uint8Array(body));
      }

      if (stream.writableFinished) {
        finish();
        return;
      }

      stream.on("chunk", forward);
      stream.once("finish", finish);
      void failOnError(invocation, (error) => {
        if (!open) {
          return;
        }
        open = false;
        started.error(error);
      });
    },
    // A reader that gives up stops the forwarding, and what the handler
    // writes after goes nowhere.
    cancel(): void {
      open = false;
      stream.off("chunk", forward);
      stream.off("finish", finish);
    },
  });
}

/**
 * End the body with the invocation's error, should it fail.
 */
async function failOnError(
  invocation: Promise<unknown>,
  fail: (error: unknown) => void,
): Promise<void> {
  try {
    await invocation;
  } catch (error) {
    fail(error);
  }
}
