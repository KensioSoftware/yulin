import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimEventBusStore } from "../bus/sim-event-bus-store.js";
import { SimEventBridgeRouter } from "../routing/sim-event-bridge-router.js";
import type { SimEventBridgeDeliveryTargets } from "../delivery/sim-event-bridge-delivery.js";
import { SimEventBridgeNoDeliveryTargets } from "../delivery/sim-event-bridge-no-delivery-targets.js";
import type { SimEventRuleStore } from "../rule/sim-event-rule-store.js";
import type { SimEventTargetStore } from "../target/sim-event-target-store.js";
import { SimEventBridgeAuthorizer } from "./authorize/sim-event-bridge-authorizer.js";
import { SimEventBridgeBusAccess } from "./bus/sim-event-bridge-bus-access.js";
import { SimEventBridgeBusCommands } from "./bus/sim-event-bridge-bus-commands.js";
import { SimEventBridgeCreateEventBus } from "./bus/sim-event-bridge-create-event-bus.js";
import { SimEventBridgeDeleteEventBus } from "./bus/sim-event-bridge-delete-event-bus.js";
import { SimEventBridgePutEvents } from "./put-events/sim-event-bridge-put-events.js";
import { SimEventBridgePutRule } from "./rule/sim-event-bridge-put-rule.js";
import { SimEventBridgeRuleAccess } from "./rule/sim-event-bridge-rule-access.js";
import { SimEventBridgeRuleCommands } from "./rule/sim-event-bridge-rule-commands.js";
import { SimEventBridgeTestEventPattern } from "./rule/sim-event-bridge-test-event-pattern.js";
import { SimEventBridgePutTargets } from "./target/sim-event-bridge-put-targets.js";
import { SimEventBridgeTargetCommands } from "./target/sim-event-bridge-target-commands.js";

interface SimEventBridgeCommandsProperties {
  readonly buses: SimEventBusStore;
  readonly rules: SimEventRuleStore;
  readonly targets: SimEventTargetStore;
  readonly deliveryTargets?: SimEventBridgeDeliveryTargets | undefined;
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
  public readonly ruleCreation: SimEventBridgePutRule;
  public readonly rules: SimEventBridgeRuleCommands;
  public readonly patternTest: SimEventBridgeTestEventPattern;
  public readonly targetCreation: SimEventBridgePutTargets;
  public readonly targets: SimEventBridgeTargetCommands;
  public readonly router: SimEventBridgeRouter;

  constructor(properties: SimEventBridgeCommandsProperties) {
    const { buses, rules, targets, accountRegionScope, background } =
      properties;
    const authorizer = new SimEventBridgeAuthorizer({ iam: properties.iam });
    const access = new SimEventBridgeBusAccess({
      buses,
      authorizer,
      accountRegionScope,
    });
    const ruleAccess = new SimEventBridgeRuleAccess({
      rules,
      buses: access,
      authorizer,
      accountRegionScope,
    });

    this.busCreation = new SimEventBridgeCreateEventBus({
      buses,
      access,
      accountRegionScope,
      clock: background,
    });
    this.busDeletion = new SimEventBridgeDeleteEventBus({
      buses,
      rules,
      targets,
      access,
    });
    this.buses = new SimEventBridgeBusCommands({ buses, access });
    this.router = new SimEventBridgeRouter({
      buses,
      rules,
      targets,
      endpoints:
        properties.deliveryTargets ?? new SimEventBridgeNoDeliveryTargets(),
      background,
      accountId: accountRegionScope.accountId,
    });
    this.putEvents = new SimEventBridgePutEvents({
      access,
      accountRegionScope,
      clock: background,
      router: this.router,
    });
    this.ruleCreation = new SimEventBridgePutRule({
      rules,
      access: ruleAccess,
      accountRegionScope,
    });
    this.rules = new SimEventBridgeRuleCommands({
      rules,
      targets,
      access: ruleAccess,
    });
    this.patternTest = new SimEventBridgeTestEventPattern({ authorizer });
    this.targetCreation = new SimEventBridgePutTargets({
      targets,
      access: ruleAccess,
    });
    this.targets = new SimEventBridgeTargetCommands({
      rules,
      targets,
      access: ruleAccess,
    });
  }
}
