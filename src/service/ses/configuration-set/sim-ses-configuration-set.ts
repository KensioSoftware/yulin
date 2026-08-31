import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simSesConfigurationSetArn } from "../sim-ses-arn.js";

/**
 * A reason SES adds a recipient to the account suppression list.
 *
 * These are the two real SES has. Which of them a configuration set names
 * decides what would be suppressed for messages sent through it.
 */
export type SimSesSuppressedReason = "BOUNCE" | "COMPLAINT";

/** Every reason a configuration set may name, for validating one. */
export const simSesSuppressedReasons: readonly SimSesSuppressedReason[] = [
  "BOUNCE",
  "COMPLAINT",
];

/**
 * How a configuration set asks for its messages to be handed to a mail
 * server.
 *
 * Declarative here. There is no delivery to simulate, so a test reads these
 * back to assert what a stack declared.
 */
export interface SimSesConfigurationSetDeliveryOptions {
  readonly tlsPolicy: "REQUIRE" | "OPTIONAL";
  readonly sendingPoolName: string | undefined;
  readonly maxDeliverySeconds: number | undefined;
}

/**
 * Whether SES would publish reputation metrics for this configuration set.
 *
 * Declarative here too. Nothing in this simulation measures a bounce rate.
 */
export interface SimSesConfigurationSetReputationOptions {
  readonly reputationMetricsEnabled: boolean;
}

/**
 * Everything a configuration set holds apart from its name.
 */
export interface SimSesConfigurationSetOptions {
  readonly suppressedReasons: readonly SimSesSuppressedReason[] | undefined;
  readonly sendingEnabled: boolean;
  readonly deliveryOptions: SimSesConfigurationSetDeliveryOptions;
  readonly reputationOptions: SimSesConfigurationSetReputationOptions;
}

interface SimSesConfigurationSetProperties {
  readonly configurationSetName: string;
  readonly options: SimSesConfigurationSetOptions;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * One stored configuration set.
 *
 * A configuration set is a named group of settings a send can be made under,
 * covering suppression, whether sending is on, how the message is handed on
 * and whether reputation metrics are published. None of it changes what a
 * message says. The sending switch controls acceptance, and the suppression
 * reasons control feedback. Delivery and reputation options remain state for
 * a test to read back.
 */
export class SimSesConfigurationSet {
  public readonly configurationSetName: string;

  public readonly arn: string;

  /**
   * The reasons that would put a recipient on the account suppression list.
   *
   * Undefined where the set declares no `SuppressionOptions`, which makes a
   * send fall back to the account setting. An empty list is an explicit
   * override that disables suppression for feedback recorded for a message
   * sent through this set.
   */
  public readonly suppressedReasons:
    | readonly SimSesSuppressedReason[]
    | undefined;

  /** Whether SES would accept a send made through this set. */
  public readonly sendingEnabled: boolean;

  public readonly deliveryOptions: SimSesConfigurationSetDeliveryOptions;

  public readonly reputationOptions: SimSesConfigurationSetReputationOptions;

  constructor(properties: SimSesConfigurationSetProperties) {
    const { options } = properties;

    this.configurationSetName = properties.configurationSetName;
    this.arn = simSesConfigurationSetArn(
      properties.accountRegionScope,
      properties.configurationSetName,
    );
    this.suppressedReasons = options.suppressedReasons;
    this.sendingEnabled = options.sendingEnabled;
    this.deliveryOptions = options.deliveryOptions;
    this.reputationOptions = options.reputationOptions;
  }
}
