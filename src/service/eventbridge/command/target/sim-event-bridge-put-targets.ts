import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";
import { SimEventTarget } from "../../target/sim-event-target.js";
import {
  simEventMaximumTargets,
  type SimEventTargetStore,
} from "../../target/sim-event-target-store.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type { SimEventBridgeRuleAccess } from "../rule/sim-event-bridge-rule-access.js";
import { refuseUnsimulatedTargetInput } from "./sim-event-bridge-unsimulated-target-input.js";
import type {
  SimPutTargetsCommand,
  SimPutTargetsCommandOutput,
} from "./target.command.js";

interface SimEventBridgePutTargetsProperties {
  readonly targets: SimEventTargetStore;
  readonly access: SimEventBridgeRuleAccess;
}

/**
 * The PutTargets command.
 *
 * The whole request is refused where a target is unusable, rather than that
 * target coming back in `FailedEntries`. Real EventBridge reports a failed
 * entry for a target it could not add, but the failures this simulation has
 * are all about the request being written for something it does not model, and
 * a caller who is not looking at `FailedEntryCount` would otherwise see a
 * silent no-op.
 */
export class SimEventBridgePutTargets {
  private readonly targets: SimEventTargetStore;
  private readonly access: SimEventBridgeRuleAccess;

  constructor(properties: SimEventBridgePutTargetsProperties) {
    this.targets = properties.targets;
    this.access = properties.access;
  }

  /**
   * Add targets to a rule, replacing any of the same id.
   */
  handle(
    command: SimPutTargetsCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimPutTargetsCommandOutput {
    const input = command.input;
    const rule = this.access.require(
      "events:PutTargets",
      { Name: input.Rule, EventBusName: input.EventBusName },
      options,
    );
    const requested = input.Targets ?? [];

    if (requested.length === 0) {
      throw new SimEventBridgeValidationException(
        "Invalid parameter: Targets Reason: a PutTargets request carries at " +
          "least one target",
      );
    }

    for (const target of requested) {
      refuseUnsimulatedTargetInput(target);
    }

    const added = requested.map((target) => SimEventTarget.of(target));
    const busName = rule.busName.value;
    const ruleName = rule.name.value;

    this.refuseOverfullRule(busName, ruleName, added);
    this.targets.put(busName, ruleName, added);

    return { $metadata: {}, FailedEntryCount: 0, FailedEntries: [] };
  }

  /**
   * Refuse a request that would take a rule past the targets it may have.
   *
   * Targets already on the rule count, except the ones this request replaces,
   * so replacing an existing id is the only way past a full rule.
   */
  private refuseOverfullRule(
    busName: string,
    ruleName: string,
    added: readonly SimEventTarget[],
  ): void {
    const kept = this.targets
      .forRule(busName, ruleName)
      .filter((existing) =>
        added.every((target) => target.id !== existing.id),
      ).length;

    if (kept + added.length > simEventMaximumTargets) {
      throw new SimEventBridgeValidationException(
        `Rule ${ruleName} would have ${String(kept + added.length)} targets, ` +
          `and a rule has at most ${String(simEventMaximumTargets)}.`,
      );
    }
  }
}
