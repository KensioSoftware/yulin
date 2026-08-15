import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSqsPollQueues } from "../sqs/poll/sim-sqs-poll-queues.js";
import type { SimEcsSecretStores } from "./task/run/secret/sim-ecs-secret-stores.js";

/**
 * What simulated ECS is built with.
 *
 * Everything here has a default, so `new SimEcs()` works on its own. The two
 * that reach outside ECS are the ones a SimAws instance supplies, and they are
 * what makes a running task part of the surrounding simulation rather than
 * something happening in a corner of it.
 */
export interface SimEcsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Whose ambient caller a running task's task Role becomes.
   *
   * This is the owning SimAws instance when ECS was built through one, so a
   * simulated AWS call a container makes is attributed to the task Role
   * everywhere in that simulation. Simulated ECS built on its own is its own
   * owner, which reaches nothing else.
   */
  readonly runAsOwner?: SimAwsRunAsOwner;

  /**
   * Where a running task's container secrets are read from.
   *
   * This is the surrounding simulation's Secrets Manager and SSM Parameter
   * Store when ECS was built through a SimAws instance. Simulated ECS built on
   * its own reaches neither, so a container declaring a secret says so rather
   * than running without it.
   */
  readonly secretStores?: SimEcsSecretStores;

  /**
   * The queues a container bound to consume one polls.
   *
   * This is the surrounding simulation's SQS when ECS was built through a
   * SimAws instance. Simulated ECS built on its own reaches none, so a
   * consuming container says so rather than polling nothing forever.
   */
  readonly consumerQueues?: SimSqsPollQueues;
}
