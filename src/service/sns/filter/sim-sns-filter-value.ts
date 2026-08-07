interface SimSnsFilterValueProperties {
  readonly text: string | undefined;
  readonly numeric: number | undefined;
  readonly logical: boolean | undefined;
}

/**
 * Read text as the number it spells, if it spells one.
 *
 * A message attribute always arrives as text, so a `Number` attribute carries
 * its digits rather than a number, and something has to turn one into the
 * other before `numeric` can be asked about it.
 */
function numberIn(text: string): number | undefined {
  const parsed = Number(text);

  if (text.trim() === "" || Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

/**
 * One value a subscription filter policy is matched against.
 *
 * A value knows which forms it has rather than which form it is, because a
 * `Number` message attribute has two: the digits it was published as, and the
 * number those digits spell. A `numeric` operator needs the second and a
 * `prefix` operator needs the first.
 *
 * A form a value does not have matches nothing of that form. That is what keeps
 * `numeric` from matching a `String` attribute that happens to hold digits,
 * which is real SNS behaviour: numeric matching is for the `Number` data type.
 */
export class SimSnsFilterValue {
  public readonly text: string | undefined;
  public readonly numeric: number | undefined;
  public readonly logical: boolean | undefined;

  private constructor(properties: SimSnsFilterValueProperties) {
    this.text = properties.text;
    this.numeric = properties.numeric;
    this.logical = properties.logical;
  }

  /**
   * Text, which is what a `String` attribute and a JSON string both are.
   */
  static ofText(value: string): SimSnsFilterValue {
    return new this({ text: value, numeric: undefined, logical: undefined });
  }

  /**
   * A `Number` message attribute, which is text that also means a number.
   */
  static ofNumericText(value: string): SimSnsFilterValue {
    return new this({
      text: value,
      numeric: numberIn(value),
      logical: undefined,
    });
  }

  /**
   * A number, which is what a JSON number in a message body is.
   */
  static ofNumber(value: number): SimSnsFilterValue {
    return new this({ text: undefined, numeric: value, logical: undefined });
  }

  /**
   * A boolean, which only a message body can hold: a message attribute has no
   * boolean data type.
   */
  static ofBoolean(value: boolean): SimSnsFilterValue {
    return new this({ text: undefined, numeric: undefined, logical: value });
  }

  /**
   * Whether this value is the one another value holds.
   *
   * The form the policy wrote decides how the comparison is made, so a policy
   * value of `100` matches the number and a policy value of `"100"` matches the
   * digits. That is what stops a policy naming a number from matching a
   * `String` attribute spelling the same one.
   */
  equals(other: SimSnsFilterValue): boolean {
    if (this.numeric !== undefined) {
      return this.numeric === other.numeric;
    }

    if (this.logical !== undefined) {
      return this.logical === other.logical;
    }

    return this.text !== undefined && this.text === other.text;
  }
}
