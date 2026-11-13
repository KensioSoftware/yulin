import {
  simLambdaHttpIntegrationContentType,
  type SimLambdaResponseStream,
} from "../../function/stream/sim-lambda-response-stream.js";
import { simLambdaUrlFollowedBody } from "./sim-lambda-url-followed-body.js";
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

  const status = prelude.statusCode ?? 200;

  return new Response(
    bodylessStatuses.has(status)
      ? null
      : simLambdaUrlFollowedBody(stream, body, invocation),
    { status, headers },
  );
}

/**
 * The statuses a response carries no body with, which the Fetch API refuses
 * a body for.
 */
const bodylessStatuses: ReadonlySet<number> = new Set([204, 205, 304]);

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
