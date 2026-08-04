import type { SimS3NotificationFilterInput } from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import type { SimS3NotificationDestinationService } from "../../notification/destination/sim-s3-notification-destination.js";
import type { SimS3NotificationEvent } from "./sim-s3-notification-event.js";
import type { SimS3NotificationFilter } from "./sim-s3-notification-filter.js";

/**
 * The parts of a stored configuration that are the same whatever the
 * destination is.
 */
export interface SimS3NotificationProperties {
  readonly id: string;
  readonly destinationArn: string;
  readonly events: readonly string[];
  readonly concreteEvents: ReadonlySet<SimS3NotificationEvent>;
  readonly filter: SimS3NotificationFilter;
}

/**
 * What a configuration reports back with, apart from its destination.
 */
interface SimS3NotificationOutput {
  readonly Id: string;
  readonly Events: string[];
  readonly Filter?: SimS3NotificationFilterInput;
}

/**
 * One destination in a Bucket's notification configuration.
 *
 * Which events reach a destination, and whether two configurations conflict,
 * are the same questions whatever the destination is, so a Bucket holds them
 * all as this. Only the ARN's property name differs on the way back out, which
 * is what a subclass is for.
 *
 * Both the configured event types and what they expand to are kept: the
 * configured ones are what GetBucketNotificationConfiguration reports back, and
 * the expanded ones are what delivery and the overlap rule work on.
 */
export abstract class SimS3Notification {
  /**
   * The kind of destination this configuration was declared for.
   */
  abstract readonly destinationService: SimS3NotificationDestinationService;

  public readonly id: string;
  public readonly destinationArn: string;
  public readonly events: readonly string[];
  public readonly concreteEvents: ReadonlySet<SimS3NotificationEvent>;
  public readonly filter: SimS3NotificationFilter;

  constructor(properties: SimS3NotificationProperties) {
    this.id = properties.id;
    this.destinationArn = properties.destinationArn;
    this.events = properties.events;
    this.concreteEvents = properties.concreteEvents;
    this.filter = properties.filter;
  }

  /**
   * Whether this configuration wants an event about an object key.
   */
  matches(event: SimS3NotificationEvent, key: string): boolean {
    return this.concreteEvents.has(event) && this.filter.matches(key);
  }

  /**
   * Whether this configuration and another cover any of the same events.
   */
  sharesEventsWith(other: SimS3Notification): boolean {
    return [...this.concreteEvents].some((event) =>
      other.concreteEvents.has(event),
    );
  }

  /**
   * The parts GetBucketNotificationConfiguration reports for any destination.
   */
  protected reported(): SimS3NotificationOutput {
    const filter = this.filter.toOutput();

    return {
      Id: this.id,
      Events: [...this.events],
      ...(filter !== undefined && { Filter: filter }),
    };
  }
}
