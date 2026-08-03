import { SimS3InvalidArgument } from "../../../error/sim-s3.error.js";
import { SimS3NotificationNotPermitted } from "../../../error/sim-s3-notification.error.js";
import { simS3EventRecordsDocument } from "../../event/sim-s3-event-records.js";
import type {
  SimS3NotificationDeliveryRequest,
  SimS3NotificationDestination,
  SimS3NotificationDestinationRequest,
} from "../sim-s3-notification-destination.js";
import type { SimS3NotificationFunctions } from "./sim-s3-notification-functions.js";

interface SimS3LambdaNotificationDestinationProperties {
  readonly functions: SimS3NotificationFunctions;
}

/**
 * A simulated Lambda function as somewhere S3 sends Object events.
 *
 * The same question is asked twice on purpose. Real S3 checks the function's
 * resource policy when the configuration is applied, and checks it again for
 * every event, so a permission removed afterwards stops delivery. Nothing is
 * remembered from the first check.
 */
export class SimS3LambdaNotificationDestination implements SimS3NotificationDestination {
  private readonly functions: SimS3NotificationFunctions;

  constructor(properties: SimS3LambdaNotificationDestinationProperties) {
    this.functions = properties.functions;
  }

  /**
   * Refuse a function the Bucket may not invoke.
   *
   * Real S3 answers InvalidArgument for a destination it could not validate,
   * which is what a missing `AddPermission` for `s3.amazonaws.com` produces.
   */
  validate(request: SimS3NotificationDestinationRequest): void {
    const refusal = this.functions.invokeRefusal(request);

    if (refusal !== undefined) {
      throw new SimS3InvalidArgument(
        `Unable to validate the following destination configurations: ${refusal}`,
      );
    }
  }

  /**
   * Invoke the function with the event, if it still admits this Bucket.
   */
  async deliver(request: SimS3NotificationDeliveryRequest): Promise<void> {
    const refusal = this.functions.invokeRefusal(request);

    if (refusal !== undefined) {
      throw new SimS3NotificationNotPermitted(refusal);
    }

    await this.functions.invoke(
      request,
      simS3EventRecordsDocument(request.event, request.configurationId),
    );
  }
}
