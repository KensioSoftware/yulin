import { SimS3NotImplemented } from "../../error/sim-s3.error.js";
import type {
  SimS3NotificationDestination,
  SimS3NotificationDestinations,
  SimS3NotificationDestinationService,
} from "./sim-s3-notification-destination.js";

interface SimS3ServiceNotificationDestinationsProperties {
  readonly lambda: SimS3NotificationDestination;
  readonly sqs: SimS3NotificationDestination;
}

/**
 * The destinations of one simulated S3 scope, one per kind of destination.
 *
 * A configuration says which kind it wants by the destination group it was
 * declared in, so nothing here reads an ARN. The ARN is the destination's own
 * business, and each of them refuses one that does not name a resource of the
 * kind it delivers to.
 */
export class SimS3ServiceNotificationDestinations implements SimS3NotificationDestinations {
  private readonly lambda: SimS3NotificationDestination;
  private readonly sqs: SimS3NotificationDestination;

  constructor(properties: SimS3ServiceNotificationDestinationsProperties) {
    this.lambda = properties.lambda;
    this.sqs = properties.sqs;
  }

  /**
   * The destination of a kind.
   */
  resolve(
    service: SimS3NotificationDestinationService,
  ): SimS3NotificationDestination {
    switch (service) {
      case "lambda": {
        return this.lambda;
      }
      case "sqs": {
        return this.sqs;
      }
    }
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
  resolve(
    _service: SimS3NotificationDestinationService,
    destinationArn: string,
  ): never {
    throw new SimS3NotImplemented(
      `Cannot notify ${destinationArn}: this SimS3 was constructed on its ` +
        "own, so it has no other simulated services to notify and no shared " +
        "background scheduler to deliver on. Reach simulated S3 through " +
        "SimAws to configure Bucket event notifications.",
    );
  }
}
