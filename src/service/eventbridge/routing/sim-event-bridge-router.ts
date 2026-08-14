import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimEventBusStore } from "../bus/sim-event-bus-store.js";
import type { SimEventBridgeDeliveryTargets } from "../delivery/sim-event-bridge-delivery.js";
import type { SimEventBridgeDeliveryFailure } from "../delivery/sim-event-bridge-delivery-failures.js";
import { SimEventBridgeTargetDelivery } from "../delivery/sim-event-bridge-target-delivery.js";
import type { SimEventBridgeEvent } from "../event/sim-event-bridge-event.js";
import type { SimEventRule } from "../rule/sim-event-rule.js";
import type { SimEventRuleStore } from "../rule/sim-event-rule-store.js";
import type { SimEventTargetStore } from "../target/sim-event-target-store.js";

interface SimEventBridgeRouterProperties {
  readonly buses: SimEventBusStore;
  readonly rules: SimEventRuleStore;
  readonly targets: SimEventTargetStore;
  readonly endpoints: SimEventBridgeDeliveryTargets;
  readonly background: BackgroundScheduler;
  readonly accountId: string;
}

/**
 * Works out which of a bus's rules an event matches, and sends it on.
 *
 * Every enabled rule on the bus is asked. Rules are independent, so one rule's
 * pattern has nothing to do with whether another matches, and an event
 * matching two rules goes to the targets of both.
 *
 * Delivery happens on the background scheduler, as real EventBridge delivers
 * after PutEvents has been answered: an event gets an id whether or not
 * anything downstream takes it. `simAws.backgroundTasksComplete()` is what
 * waits for it.
 */
export class SimEventBridgeRouter {
  private readonly buses: SimEventBusStore;
  private readonly rules: SimEventRuleStore;
  private readonly targets: SimEventTargetStore;
  private readonly background: BackgroundScheduler;
  private readonly accountId: string;
  private readonly delivery: SimEventBridgeTargetDelivery;

  constructor(properties: SimEventBridgeRouterProperties) {
    this.buses = properties.buses;
    this.rules = properties.rules;
    this.targets = properties.targets;
    this.background = properties.background;
    this.accountId = properties.accountId;
    this.delivery = new SimEventBridgeTargetDelivery({
      endpoints: properties.endpoints,
    });
  }

  /**
   * Every delivery this scope could not make.
   */
  get deliveryFailures(): readonly SimEventBridgeDeliveryFailure[] {
    return this.delivery.deliveryFailures;
  }

  /**
   * Put an event onto the bus it was addressed to, and send it to the targets
   * of every rule it matched.
   *
   * A bus that is not there takes the event nowhere, and the caller is not
   * told: real EventBridge answers a PutEvents naming an unknown bus with a
   * success and drops the event.
   */
  deliver(busName: string, event: SimEventBridgeEvent): void {
    const bus = this.buses.find(busName);

    if (bus === undefined) {
      return;
    }

    const envelope = event.toEnvelope();
    const matched = this.rules
      .forBus(busName)
      .filter((rule) => rule.matches(envelope));

    bus.receive(
      event,
      matched.map((rule) => rule.name.value),
    );

    for (const rule of matched) {
      this.send(rule, event);
    }
  }

  /**
   * Send a scheduled rule's own event to its targets.
   *
   * This does not go through pattern matching, because nothing put it onto the
   * bus: the rule's schedule produced it and the rule is the only thing it is
   * for. It is still recorded on the bus, so a test with no target yet can see
   * what firing produced through `eventsOn(...)`.
   */
  fire(rule: SimEventRule, event: SimEventBridgeEvent): void {
    this.buses.find(rule.busName.value)?.receive(event, [rule.name.value]);

    this.send(rule, event);
  }

  /**
   * Schedule one event for every target of a rule that matched it.
   */
  private send(rule: SimEventRule, event: SimEventBridgeEvent): void {
    const targets = this.targets.forRule(rule.busName.value, rule.name.value);

    for (const target of targets) {
      this.background.schedule(async () => {
        await this.delivery.deliver({
          target,
          event,
          ruleArn: rule.arn,
          ruleName: rule.name.value,
          ruleOwnerAccountId: this.accountId,
        });
      });
    }
  }
}
