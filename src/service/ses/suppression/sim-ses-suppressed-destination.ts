import type { SimSesSuppressionReason } from "./sim-ses-suppression-reason.js";

interface SimSesSuppressedDestinationProperties {
  readonly emailAddress: string;
  readonly reason: SimSesSuppressionReason;
  readonly lastUpdateTime: Date;
}

/**
 * One address on an account's suppression list.
 *
 * Real SES also reports a `MessageId` and a `FeedbackId` on an address added by
 * delivery feedback. This simulation records the reason and time only. It
 * does not publish or retain a feedback event.
 */
export class SimSesSuppressedDestination {
  /** The address as it was given, case and all. */
  public readonly emailAddress: string;

  public readonly reason: SimSesSuppressionReason;

  /** When the address was last put on the list. */
  public readonly lastUpdateTime: Date;

  constructor(properties: SimSesSuppressedDestinationProperties) {
    this.emailAddress = properties.emailAddress;
    this.reason = properties.reason;
    this.lastUpdateTime = properties.lastUpdateTime;
  }
}
