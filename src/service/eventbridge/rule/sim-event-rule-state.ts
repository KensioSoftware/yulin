import { SimEventBridgeUnsimulatedInputException } from "../error/sim-event-bridge.error.js";

const enabled = "ENABLED";

const disabled = "DISABLED";

/**
 * The third state real EventBridge has, which turns on matching of CloudTrail
 * management events.
 *
 * Nothing here delivers CloudTrail management events, so a rule in this state
 * would behave exactly like an enabled one and quietly mean less than it says.
 */
const enabledWithCloudTrail = "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS";

/**
 * Whether a rule is matching events.
 */
export class SimEventRuleState {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * The state a rule has when a request names none. Real EventBridge enables a
   * new rule by default.
   */
  static default(): SimEventRuleState {
    return new this(enabled);
  }

  /**
   * The disabled state, which DisableRule puts a rule into.
   */
  static disabled(): SimEventRuleState {
    return new this(disabled);
  }

  /**
   * Read the state a request names.
   */
  static of(value: string | undefined): SimEventRuleState {
    if (value === undefined) {
      return this.default();
    }

    if (value === enabledWithCloudTrail) {
      throw new SimEventBridgeUnsimulatedInputException(
        `Rule state ${enabledWithCloudTrail} is not simulated, because ` +
          `CloudTrail management events are not delivered here. A rule in ` +
          `that state would behave exactly like an ENABLED one.`,
      );
    }

    if (value !== enabled && value !== disabled) {
      throw new SimEventBridgeUnsimulatedInputException(
        `Invalid parameter: State Reason: '${value}' is not a rule state. A ` +
          `rule is ${enabled} or ${disabled}.`,
      );
    }

    return new this(value);
  }

  /**
   * Whether a rule in this state matches events.
   */
  get isEnabled(): boolean {
    return this.value === enabled;
  }
}
