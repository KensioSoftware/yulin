import {
  simLambdaHttpIntegrationContentType,
  type SimLambdaResponseStream,
} from "../../function/stream/sim-lambda-response-stream.js";
import type { SimLambdaHttpResponsePrelude } from "../../function/stream/sim-lambda-awslambda-global.js";

/**
 * The eight NUL bytes that end a response stream's prelude.
 */
const preludeEnd = Buffer.alloc(8);

/**
 * The HTTP response a Function URL answers a streaming handler with.
 *
 * The status, headers and cookies come from the prelude
 * `awslambda.HttpResponseStream.from` wrote, and a stream with none answers
 * `200` with the stream's own content type. The body is what follows,
 * passed on as the handler writes it. Nothing is answered until the handler
 * has written something or finished, since the prelude decides the status.
 * A handler that fails after that ends the body with an error.
 */
export async function simLambdaUrlStreamedResponse(
  stream: SimLambdaResponseStream,
  invocation: Promise<unknown>,
): Promise<Response> {
  if (stream.bytes().length === 0 && !stream.writableFinished) {
    await Promise.race([
      new Promise((resolve) => {
        stream.once("chunk", resolve);
        stream.once("finish", resolve);
      }),
      invocation,
    ]);
  }

  const written = stream.bytes();
  const { prelude, body } = splitPrelude(stream.contentType, written);
  const headers = new Headers(prelude.headers);

  const cookies = prelude.cookies ?? [];

  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }

  if (!headers.has("content-type")) {
    headers.set(
      "content-type",
      prelude === noPrelude ? stream.contentType : "application/octet-stream",
    );
  }

  return new Response(followed(stream, body, invocation), {
    status: prelude.statusCode ?? 200,
    headers,
  });
}

const noPrelude: SimLambdaHttpResponsePrelude = {};

function splitPrelude(
  contentType: string,
  written: Buffer,
): { prelude: SimLambdaHttpResponsePrelude; body: Buffer } {
  const end = written.indexOf(preludeEnd);

  if (contentType !== simLambdaHttpIntegrationContentType || end === -1) {
    return { prelude: noPrelude, body: written };
  }

  return {
    prelude: JSON.parse(
      written.subarray(0, end).toString(),
    ) as SimLambdaHttpResponsePrelude,
    body: written.subarray(end + preludeEnd.length),
  };
}

/**
 * The body, starting with what was written before the response was answered
 * and going on with each chunk the handler writes after.
 */
function followed(
  stream: SimLambdaResponseStream,
  body: Buffer,
  invocation: Promise<unknown>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      if (body.length > 0) {
        controller.enqueue(new Uint8Array(body));
      }

      if (stream.writableFinished) {
        controller.close();
        return;
      }

      stream.on("chunk", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      stream.once("finish", () => {
        controller.close();
      });
      void failOnError(invocation, controller);
    },
  });
}

/**
 * End the body with the invocation's error, should it fail.
 */
async function failOnError(
  invocation: Promise<unknown>,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  try {
    await invocation;
  } catch (error) {
    controller.error(error);
  }
}
