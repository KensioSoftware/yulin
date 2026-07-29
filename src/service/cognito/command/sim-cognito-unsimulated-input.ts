import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

/**
 * Refuses a request input this simulation does not model.
 *
 * Both creation commands need the same two refusals, in the same words: one
 * for an input nothing here honours at all, and one for an input whose only
 * simulated value is the default. Keeping them in one place is what makes
 * every refusal say why it happened rather than only that it did.
 */
export class SimCognitoUnsimulatedInput {
  private readonly operation: string;

  constructor(operation: string) {
    this.operation = operation;
  }

  /**
   * Refuse an input this simulation does not model at all.
   */
  refuse(option: string, value: unknown, feature: string): void {
    if (value === undefined) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `${this.operation} ${option} is not simulated: ${feature} would be ` +
        `ignored here and applied on real AWS`,
    );
  }

  /**
   * Refuse an input set to anything but the one value this simulation models.
   */
  refuseUnless(
    option: string,
    value: string | boolean | undefined,
    simulated: string | boolean,
    feature: string,
  ): void {
    if (value === undefined || value === simulated) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `${this.operation} ${option} '${String(value)}' is not simulated: ` +
        `${feature} would be ignored here and applied on real AWS. Only ` +
        `'${String(simulated)}' is supported.`,
    );
  }
}
