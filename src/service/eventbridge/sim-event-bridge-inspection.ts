import type { SimEventBusStore } from "./bus/sim-event-bus-store.js";
import type { SimEventBusReceipt } from "./bus/sim-event-bus.js";
import type { SimEventBus } from "./bus/sim-event-bus.js";
import { defaultEventBusName } from "./bus/sim-event-bus-name.js";
import type { SimEventBridgeEvent } from "./event/sim-event-bridge-event.js";
import type { SimEventRule } from "./rule/sim-event-rule.js";
import type { SimEventRuleStore } from "./rule/sim-event-rule-store.js";
import type { SimEventTarget } from "./target/sim-event-target.js";
import type { SimEventTargetStore } from "./target/sim-event-target-store.js";

/**
 * What a test can ask a simulated EventBridge about its own state.
 *
 * These are the simulator's own accessors rather than simulated API
 * operations: they go through no Command and no authorization, and real
 * EventBridge offers nothing like most of them. They are held apart from the
 * facade for the same reason SimAws holds its service accessors apart, which
 * is that the facade's job is delegating SDK commands and this is a different
 * job that happens to live on the same object.
 */
export abstract class SimEventBridgeInspection {
  protected abstract readonly buses: SimEventBusStore;
  protected abstract readonly rules: SimEventRuleStore;
  protected abstract readonly targets: SimEventTargetStore;

  /**
   * Find an event bus by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting bus
   * state without going through a Command and its authorization.
   */
  findEventBus(name: string): SimEventBus | undefined {
    return this.buses.find(name);
  }

  /**
   * Every event a bus received, in arrival order.
   *
   * This is the simulator's own accessor, for a test asserting on the envelope
   * EventBridge built from a PutEvents entry. Real EventBridge keeps no events
   * and offers nothing like it, so nothing an SDK command returns is built
   * from this. A bus that is not there received nothing.
   */
  eventsOn(busName: string): readonly SimEventBridgeEvent[] {
    return this.buses.find(busName)?.receivedEvents ?? [];
  }

  /**
   * Find a rule by name, on a bus.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting rule
   * state without going through a Command and its authorization.
   */
  findRule(
    ruleName: string,
    busName = defaultEventBusName,
  ): SimEventRule | undefined {
    return this.rules.find(busName, ruleName);
  }

  /**
   * Every event a bus received, with the rules each one matched.
   *
   * This is the simulator's own accessor, for a test asserting on which rules
   * an event reached. Real EventBridge keeps nothing like it, and nothing an
   * SDK command returns is built from it.
   */
  receiptsOn(busName: string): readonly SimEventBusReceipt[] {
    return this.buses.find(busName)?.receipts ?? [];
  }

  /**
   * The targets of a rule.
   *
   * This is the simulator's own accessor, for a test inspecting where a rule
   * would send an event without going through a Command and its
   * authorization.
   */
  ruleTargets(
    ruleName: string,
    busName = defaultEventBusName,
  ): readonly SimEventTarget[] {
    return this.targets.forRule(busName, ruleName);
  }
}
