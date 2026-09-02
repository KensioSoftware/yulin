import type { SimS3LifecycleRule } from "../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";
import type { SimS3StorageClass } from "../../object/s3-storage-class.js";
import type {
  SimS3LifecycleNoncurrentVersion,
  SimS3LifecycleObject,
} from "./sim-s3-lifecycle-configuration.js";
import {
  simS3ReachedNoncurrentTransitionOf,
  simS3ReachedTransitionOf,
  type SimS3ReachedTransition,
} from "./sim-s3-lifecycle-transition-instant.js";
import { simS3LifecycleRuleSelects } from "./sim-s3-lifecycle-selection.js";

/**
 * The class the rules have transitioned an Object into by an instant.
 *
 * Every rule selecting the Object contributes the transitions it has reached,
 * because real S3 applies the whole configuration to a key rather than the
 * first rule that matches it.
 */
export function simS3TransitionedObjectClass(
  rules: readonly SimS3LifecycleRule[],
  object: SimS3LifecycleObject,
  now: Date,
): SimS3StorageClass | undefined {
  return latestReached(
    rules
      .filter((rule) => simS3LifecycleRuleSelects(rule, object))
      .flatMap((rule) =>
        reachedTransitions(rule.Transitions, (transition) =>
          simS3ReachedTransitionOf(transition, object.lastModified, now),
        ),
      ),
  );
}

/**
 * The class the rules have transitioned a noncurrent version into by an
 * instant.
 */
export function simS3TransitionedVersionClass(
  rules: readonly SimS3LifecycleRule[],
  version: SimS3LifecycleNoncurrentVersion,
  now: Date,
): SimS3StorageClass | undefined {
  return latestReached(
    rules
      .filter((rule) => simS3LifecycleRuleSelects(rule, version))
      .flatMap((rule) =>
        reachedTransitions(rule.NoncurrentVersionTransitions, (transition) =>
          simS3ReachedNoncurrentTransitionOf(transition, version, now),
        ),
      ),
  );
}

/**
 * The transitions among a rule's that have been reached.
 */
function reachedTransitions<Transition>(
  transitions: readonly Transition[] | undefined,
  reach: (transition: Transition) => SimS3ReachedTransition | undefined,
): SimS3ReachedTransition[] {
  return (transitions ?? [])
    .map((transition) => reach(transition))
    .filter((transition) => transition !== undefined);
}

/**
 * The class an Object is in once every transition that has been reached has
 * been applied, or nothing where none has.
 *
 * The latest one wins. Two reached at the same instant are settled by the
 * order the rules list them in, so the last transition a configuration states
 * is where an Object past all of them ends up.
 */
function latestReached(
  transitions: readonly SimS3ReachedTransition[],
): SimS3StorageClass | undefined {
  return transitions
    .toSorted((one, other) => one.at.getTime() - other.at.getTime())
    .at(-1)?.storageClass;
}
