import { SimCloudFrontError } from "../error/sim-cloudfront.error.js";

/**
 * Turns a refused CloudFront content-serving request into the response real
 * CloudFront answers with.
 *
 * A viewer request is plain HTTP rather than an SDK call, so there is no
 * `$metadata` for a client to read the way an SDK caller would. The status
 * code is the only part of it a viewer can see, and answering the generic 500
 * every unhandled throw already becomes would turn a refusal CloudFront
 * itself treats as a 404, such as a Behavior naming a response headers policy
 * that no longer exists, into a response indistinguishable from a bug here.
 */
export class SimCloudFrontErrorResponse {
  /**
   * Build the response for an error raised while serving a viewer request.
   *
   * Anything the simulator does not recognise is re-raised rather than
   * flattened into a plausible CloudFront failure, so a bug in the simulation
   * cannot masquerade as an AWS failure a test then asserts on.
   */
  build(error: unknown): Response {
    if (error instanceof SimCloudFrontError) {
      return new Response(`${error.message}\n`, {
        status: error.$metadata.httpStatusCode ?? 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    throw error;
  }
}
