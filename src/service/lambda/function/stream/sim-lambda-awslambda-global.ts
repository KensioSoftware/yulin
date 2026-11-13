import {
  simLambdaHttpIntegrationContentType,
  type SimLambdaResponseStream,
} from "./sim-lambda-response-stream.js";

/**
 * How a handler wrapped in `streamifyResponse` is marked.
 *
 * A registered symbol, so a handler marked inside a vm sandbox reads as marked
 * outside it too. Each sandbox has a realm of its own, and the symbol registry
 * is shared between them.
 */
const streamified = Symbol.for("yulin.lambda.streamifyResponse");

/**
 * What a function URL response opens with when it is streamed, as
 * `HttpResponseStream.from` takes it.
 */
export interface SimLambdaHttpResponsePrelude {
  readonly statusCode?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly cookies?: readonly string[];
}

/**
 * The `awslambda` global the real Node.js runtime defines for function code,
 * with what response streaming needs from it.
 *
 * `streamifyResponse` marks a handler as one that takes a response stream.
 * `HttpResponseStream.from` puts the status, headers and cookies of a Function
 * URL response in front of the body, the way the real runtime does, as a JSON
 * prelude followed by eight NUL bytes.
 *
 * Zip code finds this on its global object. Code importing a handler into the
 * test process reads the host's global, which only exists there once a test
 * puts it there:
 *
 * ```typescript
 * Object.assign(globalThis, { awslambda: simLambdaAwsLambdaGlobal });
 * ```
 */
export const simLambdaAwsLambdaGlobal = {
  streamifyResponse<T extends (...parameters: never[]) => unknown>(
    handler: T,
  ): T {
    Object.defineProperty(handler, streamified, { value: true });

    return handler;
  },

  HttpResponseStream: {
    from(
      stream: SimLambdaResponseStream,
      prelude: SimLambdaHttpResponsePrelude,
    ): SimLambdaResponseStream {
      stream.setContentType(simLambdaHttpIntegrationContentType);
      stream.onBeforeFirstWrite((write) => {
        write(Buffer.from(JSON.stringify(prelude)));
        write(Buffer.alloc(8));
      });

      return stream;
    },
  },
};

/**
 * Whether a handler was wrapped in `awslambda.streamifyResponse`.
 */
export function isSimLambdaStreamingHandler(handler: unknown): boolean {
  return (
    typeof handler === "function" && Reflect.get(handler, streamified) === true
  );
}
