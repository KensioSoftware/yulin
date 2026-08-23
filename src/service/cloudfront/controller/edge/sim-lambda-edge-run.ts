import type { SimCfEdgeAssociation } from "../../edge/sim-cf-edge-association.js";
import { SimCfEdgeOriginNotSimulated } from "../../origin/sim-cf-edge-origin-not-simulated.error.js";

/**
 * Run one edge function, answering with the 502 a failed one gets.
 *
 * A handler that threw, a handler that answered with something the adapter
 * cannot read as a request or a response, and a request whose body could not
 * be read into the event, are all the same thing to CloudFront. Each is a
 * failure at the edge the viewer sees as a 502, which is why building the
 * event happens inside the callback rather than before it.
 *
 * An Origin rewrite this simulation cannot carry out is a 502 as well, and
 * that one says what it was, because nothing about it would have failed on
 * AWS and the reason is not in the function's own output.
 */
export async function runEdgeFunction<TResult>(
  association: SimCfEdgeAssociation,
  run: () => Promise<TResult>,
): Promise<TResult | Response> {
  try {
    return await run();
  } catch (error) {
    return new Response(
      `The Lambda@Edge function ${association.functionArn} failed${edgeFailureDetail(error)}`,
      { status: 502 },
    );
  }
}

/**
 * What the 502 says about the failure, where this simulation is the reason
 * for it rather than the handler.
 */
function edgeFailureDetail(error: unknown): string {
  if (error instanceof SimCfEdgeOriginNotSimulated) {
    return `: ${error.message}`;
  }

  return "";
}
