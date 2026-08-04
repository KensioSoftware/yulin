import { jsonStringify } from "../../../../../util/type-guard/json.js";
import { SimS3InvalidArgument } from "../../../error/sim-s3.error.js";
import { SimS3NotificationNotPermitted } from "../../../error/sim-s3-notification.error.js";
import { simS3EventRecordsDocument } from "../../event/sim-s3-event-records.js";
import type {
  SimS3NotificationDeliveryRequest,
  SimS3NotificationDestination,
  SimS3NotificationDestinationRequest,
} from "../sim-s3-notification-destination.js";
import type { SimS3NotificationQueues } from "./sim-s3-notification-queues.js";

interface SimS3SqsNotificationDestinationProperties {
  readonly queues: SimS3NotificationQueues;
}

/**
 * A simulated SQS queue as somewhere S3 sends Object events.
 *
 * The whole `Records` document goes on the queue as one message body, which is
 * the double envelope a consumer has to reach through: the SQS message carries
 * the S3 event document as text, so a handler parses `record.body` before it
 * can read a key out of it.
 *
 * The same question is asked twice on purpose, as it is for a function
 * destination. Real S3 checks the queue policy when the configuration is
 * applied and checks it again for every event, so a permission removed
 * afterwards stops delivery.
 */
export class SimS3SqsNotificationDestination implements SimS3NotificationDestination {
  private readonly queues: SimS3NotificationQueues;

  constructor(properties: SimS3SqsNotificationDestinationProperties) {
    this.queues = properties.queues;
  }

  /**
   * Refuse a queue the Bucket may not send to.
   *
   * Real S3 answers InvalidArgument for a destination it could not validate,
   * which is what a queue policy that does not admit `s3.amazonaws.com`
   * produces.
   */
  validate(request: SimS3NotificationDestinationRequest): void {
    const refusal = this.queues.sendRefusal(request);

    if (refusal !== undefined) {
      throw new SimS3InvalidArgument(
        `Unable to validate the following destination configurations: ${refusal}`,
      );
    }
  }

  /**
   * Put the event document on the queue, if it still admits this Bucket.
   *
   * The refusal is asked for before sending rather than left to the send,
   * which authorizes the same way, so that a queue policy saying no is recorded
   * as a refusal rather than as a fault in the simulation.
   */
  async deliver(request: SimS3NotificationDeliveryRequest): Promise<void> {
    const refusal = this.queues.sendRefusal(request);

    if (refusal !== undefined) {
      throw new SimS3NotificationNotPermitted(refusal);
    }

    await this.queues.send(
      request,
      jsonStringify(
        simS3EventRecordsDocument(request.event, request.configurationId),
      ),
    );
  }
}
