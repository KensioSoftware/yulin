import type { SimRestJsonOutput } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";

/**
 * Write the response an Invoke answers with.
 *
 * Invoke is the one Lambda operation whose response is not its output as JSON.
 * The body is the payload the function produced, and the output members are
 * arranged around it: `StatusCode` is the HTTP status, and `FunctionError` and
 * `ExecutedVersion` are headers. A handler that threw still answers `200` with
 * a payload, and `X-Amz-Function-Error` is what tells a caller the difference.
 */
export function simLambdaInvokeResponse(output: SimRestJsonOutput): Response {
  const status = output["StatusCode"];
  const payload = output["Payload"];

  return new Response(
    status !== 204 && payload instanceof Uint8Array ? payload : null,
    {
      status: typeof status === "number" ? status : 200,
      headers: {
        "content-type": "application/json",
        ...header("x-amz-function-error", output["FunctionError"]),
        ...header("x-amz-executed-version", output["ExecutedVersion"]),
      },
    },
  );
}

/**
 * A header the output produced, left out when the output did not produce it.
 */
function header(name: string, value: unknown): Record<string, string> {
  return typeof value === "string" ? { [name]: value } : {};
}
