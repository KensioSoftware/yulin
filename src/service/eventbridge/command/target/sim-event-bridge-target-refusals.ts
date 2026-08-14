import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";
import type { SimEventTarget } from "../../target/sim-event-target.js";
import { simEventMaximumTargets } from "../../target/sim-event-target-store.js";

/**
 * Refuse a request naming one target id twice.
 *
 * Putting both would leave the rule with two targets of one id, which is not a
 * state PutTargets can otherwise reach: a second request for an id replaces
 * the first. The rule would then deliver twice, and a single RemoveTargets
 * would take both away.
 */
export function refuseRepeatedTargetIds(
  added: readonly SimEventTarget[],
): void {
  const seen = new Set<string>();
  const repeated = added.find((target) => {
    const alreadySeen = seen.has(target.id);

    seen.add(target.id);

    return alreadySeen;
  });

  if (repeated !== undefined) {
    throw new SimEventBridgeValidationException(
      `Invalid parameter: Targets Reason: the target id ${repeated.id} is ` +
        `named twice in one request, and a rule has one target per id`,
    );
  }
}

/**
 * Refuse a request that would take a rule past the targets it may have.
 *
 * Targets already on the rule count, except the ones this request replaces, so
 * replacing an existing id is the only way past a full rule.
 */
export function refuseOverfullRule(
  ruleName: string,
  existing: readonly SimEventTarget[],
  added: readonly SimEventTarget[],
): void {
  const kept = existing.filter((target) =>
    added.every((replacement) => replacement.id !== target.id),
  ).length;

  if (kept + added.length > simEventMaximumTargets) {
    throw new SimEventBridgeValidationException(
      `Rule ${ruleName} would have ${String(kept + added.length)} targets, ` +
        `and a rule has at most ${String(simEventMaximumTargets)}.`,
    );
  }
}
