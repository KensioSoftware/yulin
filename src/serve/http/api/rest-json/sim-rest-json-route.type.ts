import type { SimRestJsonInput } from "./sim-rest-json-input.js";

/**
 * One simulated operation's output, as a route writes its response from.
 */
export type SimRestJsonOutput = Readonly<Record<string, unknown>>;

/**
 * One REST-JSON operation, and how to read its input out of a request.
 *
 * REST-JSON states its operation in the method and a path template, so a route
 * is matched on those two and nothing else. A template segment written
 * `{Name}` matches any one segment and hands it to the route under that name;
 * every other segment matches itself and only itself.
 */
export interface SimRestJsonRoute {
  readonly method: string;

  /**
   * The path template this operation is reached at, such as
   * `/2015-03-31/functions/{FunctionName}/invocations`.
   */
  readonly path: string;

  readonly commandName: string;

  readonly input: (input: SimRestJsonInput) => Record<string, unknown>;

  /**
   * The status this operation answers with, which real AWS varies by
   * operation rather than by outcome: a creation answers `201`, a removal
   * `204` and a read `200`. Defaults to `200`.
   */
  readonly status?: number | undefined;

  /**
   * How to write the response, for an operation that answers with something
   * other than its output as JSON. Lambda's `Invoke` is one: it answers with
   * the function's own payload, and puts its output members in the status and
   * in headers around it.
   */
  readonly output?: ((output: SimRestJsonOutput) => Response) | undefined;
}
