/**
 * One condition a pattern puts on the value of one field.
 *
 * A field's conditions are written as a list, and the field matches when any
 * one of them does, so this is the unit that list holds. `exists` is the only
 * one with anything to say about a field that is not there, which is why
 * `matchesAbsent` has a default rather than every match having to answer it.
 */
export abstract class SimEventPatternMatch {
  /**
   * Whether a value the event carries satisfies this condition.
   */
  abstract matchesValue(value: unknown): boolean;

  /**
   * Whether this condition holds for a field the event does not have.
   *
   * Only `{"exists": false}` does. Every other condition is about a value, and
   * an absent field has none to compare.
   */
  matchesAbsent(): boolean {
    return false;
  }
}
