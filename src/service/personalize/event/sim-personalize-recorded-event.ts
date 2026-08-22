export interface SimPersonalizeRecordedEventProperties {
  readonly trackingId: string;
  readonly eventTrackerArn: string;
  readonly userId: string | undefined;
  readonly sessionId: string;
  readonly eventId: string | undefined;
  readonly eventType: string;
  readonly eventValue: number | undefined;
  readonly itemId: string | undefined;
  readonly properties: string | undefined;
  readonly sentAt: Date;
  readonly recommendationId: string | undefined;
  readonly impression: readonly string[] | undefined;
}

/**
 * One item interaction a simulated event tracker has accepted.
 *
 * Real Personalize puts the event into the Interactions dataset behind the
 * tracker, where later training reads it. Simulated Personalize trains
 * nothing, so the event is kept here as the request carried it. That record is
 * what a test asserts against.
 */
export class SimPersonalizeRecordedEvent {
  /** The tracking ID the request named, and through it the tracker. */
  public readonly trackingId: string;

  /** The ARN of the tracker that tracking ID belongs to. */
  public readonly eventTrackerArn: string;

  /** The user the interaction belongs to, absent on an anonymous session. */
  public readonly userId: string | undefined;

  public readonly sessionId: string;

  /**
   * The ID the request gave the event. Real Personalize generates one where
   * the request omits it, and this one leaves it absent.
   */
  public readonly eventId: string | undefined;

  public readonly eventType: string;

  public readonly eventValue: number | undefined;

  public readonly itemId: string | undefined;

  /**
   * The event's own data, as the JSON string the request carried.
   *
   * The SDK serialises an object here before it leaves the client, so this is
   * the string the wire would have carried. A test asserting on one property
   * parses it.
   */
  public readonly properties: string | undefined;

  /**
   * When the interaction happened, from the simulated clock where the
   * request omitted it.
   */
  public readonly sentAt: Date;

  public readonly recommendationId: string | undefined;

  /**
   * The items shown to the user, where the request recorded impressions.
   *
   * Copied on the way in, as `sentAt` is. The SDK takes a mutable array here.
   */
  public readonly impression: readonly string[] | undefined;

  constructor(properties: SimPersonalizeRecordedEventProperties) {
    this.trackingId = properties.trackingId;
    this.eventTrackerArn = properties.eventTrackerArn;
    this.userId = properties.userId;
    this.sessionId = properties.sessionId;
    this.eventId = properties.eventId;
    this.eventType = properties.eventType;
    this.eventValue = properties.eventValue;
    this.itemId = properties.itemId;
    this.properties = properties.properties;
    this.sentAt = new Date(properties.sentAt);
    this.recommendationId = properties.recommendationId;
    this.impression =
      properties.impression === undefined
        ? undefined
        : [...properties.impression];
  }
}
