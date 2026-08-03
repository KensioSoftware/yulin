import type { SimS3LambdaFunctionConfigurationInput } from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import type { SimS3NotificationFilter } from "./sim-s3-notification-filter.js";
import type { SimS3NotificationEvent } from "./sim-s3-notification-event.js";

interface SimS3LambdaNotificationProperties {
  readonly id: string;
  readonly functionArn: string;
  readonly events: readonly string[];
  readonly concreteEvents: ReadonlySet<SimS3NotificationEvent>;
  readonly filter: SimS3NotificationFilter;
}

/**
 * One Lambda function destination in a Bucket's notification configuration.
 *
 * Both the configured event types and what they expand to are kept: the
 * configured ones are what GetBucketNotificationConfiguration reports back, and
 * the expanded ones are what delivery and the overlap rule work on.
 */
export class SimS3LambdaNotification {
  public readonly id: string;
  public readonly functionArn: string;
  public readonly events: readonly string[];
  public readonly concreteEvents: ReadonlySet<SimS3NotificationEvent>;
  public readonly filter: SimS3NotificationFilter;

  constructor(properties: SimS3LambdaNotificationProperties) {
    this.id = properties.id;
    this.functionArn = properties.functionArn;
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
  sharesEventsWith(other: SimS3LambdaNotification): boolean {
    return [...this.concreteEvents].some((event) =>
      other.concreteEvents.has(event),
    );
  }

  /**
   * This configuration as GetBucketNotificationConfiguration reports it.
   */
  toOutput(): SimS3LambdaFunctionConfigurationInput {
    const filter = this.filter.toOutput();

    return {
      Id: this.id,
      LambdaFunctionArn: this.functionArn,
      Events: [...this.events],
      ...(filter !== undefined && { Filter: filter }),
    };
  }
}
