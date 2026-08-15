import { SimAwsEcsTargetGroups } from "../../ecs/service/load-balancer/sim-aws-ecs-target-groups.js";
import { SimAwsEcsSecretStores } from "../../ecs/task/run/secret/sim-aws-ecs-secret-stores.js";
import { SimSqsCommandPollQueues } from "../../sqs/poll/sim-sqs-command-poll-queues.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";

/**
 * What simulated ECS reaches for in the rest of the simulation.
 */
interface SimAwsEcsCollaborators {
  readonly runAsOwner: SimAws;
  readonly secretStores: SimAwsEcsSecretStores;
  readonly consumerQueues: SimSqsCommandPollQueues;
  readonly targetGroups: SimAwsEcsTargetGroups;
}

/**
 * Build the collaborators simulated ECS takes beyond the scoped ones every
 * service gets.
 *
 * A running task's containers take the whole simulation as the owner of their
 * task Role, so what they do is authorized across all of it rather than only in
 * this scope. Container secrets are read from the whole simulation too, since
 * the ARN a secret is named by carries the Account and Region it lives in, and
 * the scope goes with it because a bare SSM parameter name carries neither.
 *
 * A container bound to consume a queue polls this scope's own SQS, as a real
 * task reads a queue in the Account and Region it runs in.
 *
 * A service registers its tasks into a target group of the whole simulation,
 * looked for where its ARN says it is. A service is refused a target group
 * outside its own Account and Region before it gets that far, so the two come
 * to the same place by different routes.
 */
export function simAwsEcsCollaborators(
  simAws: SimAws,
  scope: SimAwsAccountRegionContainer,
): SimAwsEcsCollaborators {
  return {
    runAsOwner: simAws,
    secretStores: new SimAwsEcsSecretStores({
      simAws,
      accountRegionScope: scope.accountRegionScope,
    }),
    consumerQueues: new SimSqsCommandPollQueues({ sqs: scope.sqs() }),
    targetGroups: new SimAwsEcsTargetGroups({ simAws }),
  };
}
