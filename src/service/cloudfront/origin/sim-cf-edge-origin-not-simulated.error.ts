/**
 * An Origin rewrite an origin-request handler asked for that this simulation
 * cannot carry out.
 *
 * Real CloudFront lets a handler hand back either kind of Origin, whichever
 * kind the Behavior started with, and lets it point an S3 Origin at another
 * Bucket. Both need something a simulated Origin does not hold: the dispatcher
 * that reaches a custom Origin, and the Bucket a domain name resolved to when
 * the Distribution was written. Rather than fetch from the Origin the handler
 * did not ask for, the rewrite is refused, and the viewer gets the 502 a
 * failed edge function gets.
 */
export class SimCfEdgeOriginNotSimulated extends Error {}
