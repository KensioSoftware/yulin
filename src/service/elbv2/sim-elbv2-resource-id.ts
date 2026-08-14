/**
 * How long the hexadecimal id in an ELBv2 ARN is.
 */
const resourceIdLength = 16;

/**
 * How long the numeric suffix in a load balancer DNS name is.
 */
const dnsSuffixLength = 10;

/**
 * The id real ELB puts at the end of a load balancer, target group, listener
 * or rule ARN.
 *
 * Real ELB generates it at random. Here it counts, because a test asserting on
 * an ARN it did not capture is worth more than an id no one can predict, and
 * the shape is what anything reading the ARN cares about. It is still 16
 * hexadecimal characters, so an ARN from this simulation parses everywhere a
 * real one does.
 */
export function simElbV2ResourceId(sequence: number): string {
  return sequence.toString(16).padStart(resourceIdLength, "0");
}

/**
 * The digits real ELB puts between a load balancer's name and its DNS suffix.
 *
 * Deterministic for the same reason the ARN id is, and the same length, so a
 * host name from this simulation is one a real load balancer could have had.
 */
export function simElbV2DnsSuffix(sequence: number): string {
  return String(sequence).padStart(dnsSuffixLength, "0");
}
