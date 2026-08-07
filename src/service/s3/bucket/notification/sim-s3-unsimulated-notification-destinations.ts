import type { SimS3NotificationConfigurationInput } from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import { SimS3NotImplemented } from "../../error/sim-s3.error.js";

/**
 * The destination groups a request can carry that this simulator does not
 * deliver to, and what to say about each.
 */
const unsimulatedDestinations = new Map<string, string>([
  ["EventBridgeConfiguration", "EventBridge"],
]);

/**
 * Refuse a destination group this simulator cannot deliver to.
 *
 * Naming the destination matters more than the refusal: a configuration quietly
 * accepted and never delivered is the failure this feature exists to remove, so
 * an EventBridge destination says so rather than being dropped.
 */
export function simS3RefuseUnsimulatedDestinations(
  input: SimS3NotificationConfigurationInput,
): void {
  for (const [property, destination] of unsimulatedDestinations) {
    // Read-only lookup of a fixed set of property names.

    const configured = input[property as keyof typeof input];

    if (configured === undefined) {
      continue;
    }

    if (Array.isArray(configured) && configured.length === 0) {
      continue;
    }

    throw new SimS3NotImplemented(
      `Simulated S3 cannot notify a ${destination}. ${property} is not ` +
        "simulated; use LambdaFunctionConfigurations, QueueConfigurations or " +
        "TopicConfigurations.",
    );
  }
}
