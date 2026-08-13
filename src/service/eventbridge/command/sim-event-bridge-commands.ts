import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimEventBusStore } from "../bus/sim-event-bus-store.js";
import { SimEventBridgeAuthorizer } from "./authorize/sim-event-bridge-authorizer.js";
import { SimEventBridgeBusAccess } from "./bus/sim-event-bridge-bus-access.js";
import { SimEventBridgeBusCommands } from "./bus/sim-event-bridge-bus-commands.js";
import { SimEventBridgeCreateEventBus } from "./bus/sim-event-bridge-create-event-bus.js";
import { SimEventBridgeDeleteEventBus } from "./bus/sim-event-bridge-delete-event-bus.js";
import { SimEventBridgePutEvents } from "./put-events/sim-event-bridge-put-events.js";

interface SimEventBridgeCommandsProperties {
  readonly buses: SimEventBusStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Every command handler one simulated EventBridge scope delegates to.
 *
 * The wiring lives here rather than in the facade so that `SimEventBridge`
 * stays what it is meant to be: state and delegation. Which handler shares
 * which collaborator is a fact about the handlers, not about the service
 * object in front of them.
 */
export class SimEventBridgeCommands {
  public readonly busCreation: SimEventBridgeCreateEventBus;
  public readonly busDeletion: SimEventBridgeDeleteEventBus;
  public readonly buses: SimEventBridgeBusCommands;
  public readonly putEvents: SimEventBridgePutEvents;

  constructor(properties: SimEventBridgeCommandsProperties) {
    const { buses, accountRegionScope, background } = properties;
    const access = new SimEventBridgeBusAccess({
      buses,
      authorizer: new SimEventBridgeAuthorizer({ iam: properties.iam }),
      accountRegionScope,
    });

    this.busCreation = new SimEventBridgeCreateEventBus({
      buses,
      access,
      accountRegionScope,
      clock: background,
    });
    this.busDeletion = new SimEventBridgeDeleteEventBus({ buses, access });
    this.buses = new SimEventBridgeBusCommands({ buses, access });
    this.putEvents = new SimEventBridgePutEvents({
      buses,
      access,
      accountRegionScope,
      clock: background,
    });
  }
}
