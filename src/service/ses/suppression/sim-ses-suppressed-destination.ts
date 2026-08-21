import type { SimSesSuppressionReason } from "./sim-ses-suppression-reason.js";

interface SimSesSuppressedDestinationProperties {
  readonly emailAddress: string;
  readonly reason: SimSesSuppressionReason;
  readonly lastUpdateTime: Date;
}

/**
 * One address on an account's suppression list.
 *
 * Real SES also reports a `MessageId` and a `FeedbackId` on the address it put
 * there itself, describing the bounce or complaint that did it. Nothing
 * bounces here, so every address on this list was put there by hand and there
 * is no feedback event to point at.
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
