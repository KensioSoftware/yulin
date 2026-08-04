/**
 * Sends a sim CloudFront custom Origin request into the simulated AWS
 * environment the Distribution belongs to.
 *
 * A custom Origin is reached over HTTP, and Yulin does no real networking, so
 * the request never leaves the process: the Origin hostname names another
 * simulated service, which serves the request the same way it serves one
 * arriving on localhost.
 *
 * This is the seam between CloudFront and that wider environment. A
 * standalone `SimCloudFront` has no environment to reach, and so has no
 * dispatcher, rather than reaching the network.
 */
export interface SimCfCustomOriginDispatcher {
  /**
   * Whether a Yulin-local Origin hostname names a simulated service.
   */
  resolves(originHostname: string): boolean;

  /**
   * Send an Origin request to the simulated service its hostname names.
   */
  fetch(request: Request): Promise<Response>;
}
