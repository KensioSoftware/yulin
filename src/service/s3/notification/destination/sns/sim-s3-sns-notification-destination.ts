import { jsonStringify } from "../../../../../util/type-guard/json.js";
import { SimS3InvalidArgument } from "../../../error/sim-s3.error.js";
import { SimS3NotificationNotPermitted } from "../../../error/sim-s3-notification.error.js";
import { simS3EventRecordsDocument } from "../../event/sim-s3-event-records.js";
import type {
  SimS3NotificationDeliveryRequest,
  SimS3NotificationDestination,
  SimS3NotificationDestinationRequest,
} from "../sim-s3-notification-destination.js";
import type { SimS3NotificationTopics } from "./sim-s3-notification-topics.js";

interface SimS3SnsNotificationDestinationProperties {
  readonly topics: SimS3NotificationTopics;
}

/**
 * A simulated SNS topic as somewhere S3 sends Object events.
 *
 * The whole `Records` document is published as the message, which is the same
 * text a queue destination receives as its message body. A subscriber reaching
 * it through an SNS envelope therefore has two layers to parse rather than one:
 * the envelope's `Message` is the S3 event document as text.
 *
 * The same question is asked twice on purpose, as it is for the other
 * destinations. Real S3 checks the topic policy when the configuration is
 * applied and checks it again for every event, so a permission removed
 * afterwards stops delivery.
 */
export class SimS3SnsNotificationDestination implements SimS3NotificationDestination {
  private readonly topics: SimS3NotificationTopics;

  constructor(properties: SimS3SnsNotificationDestinationProperties) {
    this.topics = properties.topics;
  }

  /**
   * Refuse a topic the Bucket may not publish to.
   *
   * Real S3 answers InvalidArgument for a destination it could not validate,
   * which is what a topic policy that does not admit `s3.amazonaws.com`
   * produces.
   */
  validate(request: SimS3NotificationDestinationRequest): void {
    const refusal = this.topics.publishRefusal(request);

    if (refusal !== undefined) {
      throw new SimS3InvalidArgument(
        `Unable to validate the following destination configurations: ${refusal}`,
      );
    }
  }

  /**
   * Publish the event document to the topic, if it still admits this Bucket.
   *
   * The refusal is asked for before publishing rather than left to the publish,
   * which authorizes the same way, so that a topic policy saying no is recorded
   * as a refusal rather than as a fault in the simulation.
   */
  async deliver(request: SimS3NotificationDeliveryRequest): Promise<void> {
    const refusal = this.topics.publishRefusal(request);

    if (refusal !== undefined) {
      throw new SimS3NotificationNotPermitted(refusal);
    }

    await this.topics.publish(
      request,
      jsonStringify(
        simS3EventRecordsDocument(request.event, request.configurationId),
      ),
    );
  }
}
