import type { SimEventBridgeEvent } from "../event/sim-event-bridge-event.js";
import type { SimEventBusStore } from "../bus/sim-event-bus-store.js";
import type { SimEventRuleStore } from "../rule/sim-event-rule-store.js";

interface SimEventBridgeRouterProperties {
  readonly buses: SimEventBusStore;
  readonly rules: SimEventRuleStore;
}

/**
 * Works out which of a bus's rules an event matches.
 *
 * This is the whole of what a bus does with an event: every enabled rule on
 * that bus is asked, and each one that matches gets the event. Rules are
 * independent, so one rule's pattern has nothing to do with whether another
 * matches, and an event matching two rules goes to both.
 *
 * Sending a matched event on to the rule's targets is what a later change adds
 * here. Today the match is recorded on the bus and goes no further, because
 * targets are not simulated yet.
 */
export class SimEventBridgeRouter {
  private readonly buses: SimEventBusStore;
  private readonly rules: SimEventRuleStore;

  constructor(properties: SimEventBridgeRouterProperties) {
    this.buses = properties.buses;
    this.rules = properties.rules;
  }

  /**
   * Put an event onto the bus it was addressed to, and work out which of that
   * bus's rules it matched.
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
  }
}
