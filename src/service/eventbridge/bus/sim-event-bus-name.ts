import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../error/sim-event-bridge.error.js";

/**
 * The name of the event bus every Account has without creating one.
 *
 * A request that names no bus reaches this one, which is why an AWS service
 * sending events to an Account with no EventBridge configuration at all still
 * has somewhere to send them.
 */
export const defaultEventBusName = "default";

/**
 * Real EventBridge allows alphanumerics, full stops, hyphens and underscores,
 * up to 256 characters. The `/` character is in the API's own pattern but only
 * for partner event bus names, which take the form `aws.partner/...`.
 */
const eventBusNamePattern = /^[.\-_A-Za-z0-9]{1,256}$/;

const partnerNameSeparator = "/";

/**
 * The name of one simulated event bus.
 *
 * The name is the whole identity of a bus within an Account and Region, and it
 * is the resource part of the ARN. Validating it in one place is what keeps a
 * name that works here one that would work on real AWS.
 */
export class SimEventBusName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * The name of the default event bus.
   */
  static default(): SimEventBusName {
    return new this(defaultEventBusName);
  }

  /**
   * Read the bus name a request has to carry.
   */
  static required(
    name: string | undefined,
    parameterName: string,
  ): SimEventBusName {
    if (name === undefined || name === "") {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: ${parameterName} is required`,
      );
    }

    return this.of(name);
  }

  /**
   * Read a bus name from request input, refusing one real EventBridge would
   * refuse.
   */
  static of(value: string): SimEventBusName {
    if (value.includes(partnerNameSeparator)) {
      throw new SimEventBridgeUnsimulatedInputException(
        `Event bus name '${value}' carries a '/', which only a partner event ` +
          `bus name does. Partner event buses are not simulated.`,
      );
    }

    if (!eventBusNamePattern.test(value)) {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Name Reason: '${value}' is not a valid event bus ` +
          `name. Event bus names are made up of only letters, numbers, full ` +
          `stops, hyphens and underscores, and are between 1 and 256 ` +
          `characters long.`,
      );
    }

    return new this(value);
  }

  /**
   * Whether this is the name of the default event bus.
   */
  get isDefault(): boolean {
    return this.value === defaultEventBusName;
  }
}
