import { SimEventBusName } from "../../bus/sim-event-bus-name.js";
import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type { SimEventBridgeBusAccess } from "./sim-event-bridge-bus-access.js";
import type {
  SimDeleteEventBusCommand,
  SimDeleteEventBusCommandOutput,
} from "./bus.command.js";

interface SimEventBridgeDeleteEventBusProperties {
  readonly buses: SimEventBusStore;
  readonly access: SimEventBridgeBusAccess;
}

/**
 * The DeleteEventBus command.
 *
 * Two rules of its own. The default bus cannot go, as it cannot on real AWS.
 * And deleting a bus that is not there succeeds, because EventBridge documents
 * no not-found error for this operation, so a teardown that runs twice is
 * safe.
 *
 * The name is taken as a name rather than as an ARN, unlike DescribeEventBus:
 * the API's own pattern for this operation admits no ARN form.
 */
export class SimEventBridgeDeleteEventBus {
  private readonly buses: SimEventBusStore;
  private readonly access: SimEventBridgeBusAccess;

  constructor(properties: SimEventBridgeDeleteEventBusProperties) {
    this.buses = properties.buses;
    this.access = properties.access;
  }

  /**
   * Delete a custom event bus.
   *
   * The name frees at once, so it can be reused straight away.
   */
  handle(
    command: SimDeleteEventBusCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimDeleteEventBusCommandOutput {
    const name = SimEventBusName.required(command.input.Name, "Name");

    if (name.isDefault) {
      throw new SimEventBridgeValidationException(
        "Cannot delete event bus default.",
      );
    }

    const bus = this.access.find("events:DeleteEventBus", name, options);

    if (bus !== undefined) {
      this.buses.remove(bus);
    }

    return { $metadata: {} };
  }
}
