import type {
  SimPayload2Event,
  SimPayload2Result,
} from "../../../../serve/payload-2/sim-payload-2-event.type.js";

/**
 * Lambda Function URL invocation event.
 *
 * Real Function URLs speak the API Gateway HTTP API payload format 2.0, so
 * this is that event under the name Lambda users look for. A Function URL is
 * always its own `$default` route on a `$default` stage, and has no route to
 * capture path parameters from, so those fields of the shared event are the
 * only ones a Function URL invocation never varies.
 */
export type SimLambdaFunctionUrlEvent = SimPayload2Event;

/**
 * Structured handler result for a Function URL invocation.
 *
 * A handler may also return any other value, in which case real Lambda infers
 * a 200 JSON response from it.
 */
export type SimLambdaFunctionUrlResult = SimPayload2Result;
