import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";
import { SimCognitoCanonicalValue } from "./sim-cognito-canonical-value.js";

/**
 * Refuses a structured request input set to anything but the one value this
 * simulation models.
 *
 * This is what `SimCognitoUnsimulatedInput.refuseUnless` does for a string
 * or a boolean. That one compares with `===`, which answers false for
 * two objects saying the same thing, so a property arriving as an object
 * needs comparing by its contents instead. The comparison is the whole of the
 * difference, so it lives beside the existing refusals rather than inside
 * them.
 */
export class SimCognitoUnsimulatedStructure {
  private readonly operation: string;

  constructor(operation: string) {
    this.operation = operation;
  }

  /**
   * Refuse a structured input that is not the one this simulation models.
   *
   * Every key is compared, so an object carrying an extra one is refused even
   * where the keys it shares with the simulated value all match.
   */
  refuseUnless(
    option: string,
    value: object | undefined,
    simulated: object,
    feature: string,
  ): void {
    if (value === undefined) {
      return;
    }

    const simulatedValue = new SimCognitoCanonicalValue(simulated);

    if (simulatedValue.matches(value)) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `${this.operation} ${option} ${new SimCognitoCanonicalValue(value).text}` +
        ` is not simulated: ${feature} would be ignored here and applied on ` +
        `real AWS. Only ${simulatedValue.text} is supported.`,
    );
  }
}
