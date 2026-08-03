import { SimS3NotImplemented } from "../../error/sim-s3.error.js";
import type {
  SimS3NotificationDestination,
  SimS3NotificationDestinations,
} from "./sim-s3-notification-destination.js";

interface SimS3ServiceNotificationDestinationsProperties {
  readonly lambda: SimS3NotificationDestination;
}

/**
 * The destinations of one simulated S3 scope, keyed on the service an ARN
 * names.
 *
 * An ARN's service segment is the only thing that decides which destination
 * takes it, so the lookup is a map rather than a chain of checks, and a service
 * this simulator has no destination for is refused by name.
 */
export class SimS3ServiceNotificationDestinations implements SimS3NotificationDestinations {
  private readonly byService: ReadonlyMap<string, SimS3NotificationDestination>;

  constructor(properties: SimS3ServiceNotificationDestinationsProperties) {
    this.byService = new Map([["lambda", properties.lambda]]);
  }

  /**
   * The destination an ARN names.
   */
  resolve(destinationArn: string): SimS3NotificationDestination {
    const service = destinationArn.split(":", 3)[2];
    const destination =
      service === undefined ? undefined : this.byService.get(service);

    if (destination === undefined) {
      throw new SimS3NotImplemented(
        `Simulated S3 cannot notify ${destinationArn}. It notifies a Lambda ` +
          "function; SQS queue, SNS topic and EventBridge destinations are " +
          "not simulated.",
      );
    }

    return destination;
  }
}

/**
 * The destinations a simulated S3 built on its own has, which is none.
 *
 * A standalone SimS3 owns its own background scheduler, so nothing could wait
 * for a delivery it made even if it could make one. Refusing when the
 * configuration is applied says so at the point the mistake was made, rather
 * than leaving a configured Bucket that never notifies anything.
 */
export class SimS3NoNotificationDestinations implements SimS3NotificationDestinations {
  /**
   * Refuse every destination, explaining how to get one.
   */
  resolve(destinationArn: string): never {
    throw new SimS3NotImplemented(
      `Cannot notify ${destinationArn}: this SimS3 was constructed on its ` +
        "own, so it has no other simulated services to notify and no shared " +
        "background scheduler to deliver on. Reach simulated S3 through " +
        "SimAws to configure Bucket event notifications.",
    );
  }
}
