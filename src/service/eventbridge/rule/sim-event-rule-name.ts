import { SimEventBridgeValidationException } from "../error/sim-event-bridge.error.js";

/**
 * Real EventBridge allows alphanumerics, full stops, hyphens and underscores,
 * up to 64 characters. A rule name is shorter than a bus name and takes no
 * `/`, even for a rule on a custom bus, where the bus name goes in the ARN
 * rather than in the rule's own name.
 */
const ruleNamePattern = /^[.\-_A-Za-z0-9]{1,64}$/;

/**
 * The name of one simulated rule.
 *
 * A rule name is unique within one event bus rather than within the Account,
 * so two buses may each have a rule called `orders`.
 */
export class SimEventRuleName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Read the rule name a request has to carry.
   */
  static required(name: string | undefined): SimEventRuleName {
    if (name === undefined || name === "") {
      throw new SimEventBridgeValidationException(
        "Invalid parameter: Name is required",
      );
    }

    return this.of(name);
  }

  /**
   * Read a rule name from request input, refusing one real EventBridge would
   * refuse.
   */
  static of(value: string): SimEventRuleName {
    if (!ruleNamePattern.test(value)) {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Name Reason: '${value}' is not a valid rule ` +
          `name. Rule names are made up of only letters, numbers, full ` +
          `stops, hyphens and underscores, and are between 1 and 64 ` +
          `characters long.`,
      );
    }

    return new this(value);
  }
}
