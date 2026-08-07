import type { SimSnsFilterValue } from "../sim-sns-filter-value.js";

/**
 * One match condition of a filter policy, which is one entry of the list a
 * policy key holds.
 *
 * There is one of these per operator rather than one evaluator branching on the
 * operator name, so an operator is a small class holding what it was written
 * with and answering one question about a value.
 */
export abstract class SimSnsFilterMatch {
  /**
   * Whether this matches a key the message does not carry at all.
   *
   * Every operator but `exists` answers no, which is real SNS behaviour: a
   * message with no `type` attribute matches no rule about `type` except the
   * one asking for it to be missing.
   */
  public readonly matchesAbsence: boolean = false;

  /**
   * Whether one value the message carries at the key matches.
   */
  abstract matchesValue(value: SimSnsFilterValue): boolean;
}
