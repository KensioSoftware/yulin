import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEventBus } from "../../bus/sim-event-bus.js";
import { SimEventBusName } from "../../bus/sim-event-bus-name.js";
import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import { SimEventBridgeResourceAlreadyExistsException } from "../../error/sim-event-bridge.error.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type { SimEventBridgeBusAccess } from "./sim-event-bridge-bus-access.js";
import { refuseUnsimulatedBusInput } from "./sim-event-bridge-unsimulated-bus-input.js";
import type {
  SimCreateEventBusCommand,
  SimCreateEventBusCommandOutput,
} from "./bus.command.js";

interface SimEventBridgeCreateEventBusProperties {
  readonly buses: SimEventBusStore;
  readonly access: SimEventBridgeBusAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: BackgroundScheduler;
}

/**
 * The CreateEventBus command.
 *
 * Unlike SNS CreateTopic this is not idempotent: a name already taken is
 * refused rather than answered with the existing bus. `default` is among those
 * names, since that bus is always there.
 */
export class SimEventBridgeCreateEventBus {
  private readonly buses: SimEventBusStore;
  private readonly access: SimEventBridgeBusAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: BackgroundScheduler;

  constructor(properties: SimEventBridgeCreateEventBusProperties) {
    this.buses = properties.buses;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Create a custom event bus.
   *
   * The inputs are read before the name is looked for, so a request naming one
   * this simulation will not take is refused whether or not the name is free.
   */
  handle(
    command: SimCreateEventBusCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimCreateEventBusCommandOutput {
    const input = command.input;

    refuseUnsimulatedBusInput(input);

    const name = SimEventBusName.required(input.Name, "Name");

    this.access.authorizeName("events:CreateEventBus", name, options);

    if (this.buses.find(name.value) !== undefined) {
      throw new SimEventBridgeResourceAlreadyExistsException(
        `Event bus ${name.value} already exists.`,
      );
    }

    const bus = this.created(name, input.Description);

    return {
      $metadata: {},
      EventBusArn: bus.arn.value,
      Description: bus.description,
    };
  }

  /**
   * Create the bus itself, once the name is known to be free.
   */
  private created(
    name: SimEventBusName,
    description: string | undefined,
  ): SimEventBus {
    const bus = new SimEventBus({
      name,
      accountRegionScope: this.accountRegionScope,
      createdAt: this.clock.now(),
      description,
    });

    this.buses.add(bus);

    return bus;
  }
}
