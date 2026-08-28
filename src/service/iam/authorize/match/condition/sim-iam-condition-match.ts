/**
 * What reading one statement's condition block told the simulator.
 *
 * A condition block either matched the request or it did not, and separately
 * from that it may have held an operator sim IAM has no implementation for.
 * The two facts travel together because a statement carrying an unread
 * operator does not match, and a caller that only reads `matched` cannot tell
 * that apart from a condition the simulator read and rejected.
 */
export interface SimIamConditionMatch {
  /**
   * Whether the whole condition block matched the request.
   *
   * An operator the simulator cannot evaluate fails closed. A block holding
   * one never matches.
   */
  readonly matched: boolean;

  /**
   * The operator keywords sim IAM has no implementation for.
   *
   * These are reported only where every other operator in the block matched.
   * A block ruled out by an operator the simulator did read needs nothing
   * said about it: the statement would not have matched either way.
   */
  readonly unsupportedOperators: readonly string[];
}
