import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import { SimEcsServiceRegistration } from "../../service/load-balancer/sim-ecs-service-registration.js";
import { simEcsDesiredCount } from "../../service/sim-ecs-desired-count.js";
import type { SimEcsServiceLoadBalancer } from "../../service/sim-ecs-service-detail.js";
import { simEcsReplicaSchedulingStrategy } from "../../service/sim-ecs-service.js";
import { requiredSimEcsName } from "../../sim-ecs-name.js";
import { SimEcsTaskDefinitionId } from "../../task-definition/sim-ecs-task-definition-id.js";
import type { SimCreateServiceCommandInput } from "./create-service.command.js";

/**
 * What one `CreateService` request asked for.
 *
 * This is the part of the request that can be read before anything is looked
 * up: what the service is called, which task definition it runs, how many tasks
 * of it to keep and which target groups those tasks are registered into. A
 * malformed request is malformed whoever made it and whatever state there is,
 * so it is read first and refused first. Whether the target groups it names are
 * there is a different question, answered once there is state to answer it
 * from.
 */
export class SimEcsCreateServiceRequest {
  public readonly serviceName: string;
  public readonly taskDefinitionId: SimEcsTaskDefinitionId;
  public readonly desiredCount: number;
  public readonly registrations: readonly SimEcsServiceRegistration[];

  constructor(
    input: SimCreateServiceCommandInput,
    accountRegionScope: SimAwsAccountRegionScope,
  ) {
    SimEcsCreateServiceRequest.acceptedStrategy(input.schedulingStrategy);
    this.serviceName = requiredSimEcsName(input.serviceName, "service name");
    this.taskDefinitionId = SimEcsTaskDefinitionId.parse(
      input.taskDefinition,
      accountRegionScope,
    );
    this.desiredCount = simEcsDesiredCount(
      SimEcsCreateServiceRequest.requiredCount(input.desiredCount),
    );
    this.registrations = SimEcsCreateServiceRequest.registrationsOf(
      input.loadBalancers ?? [],
      accountRegionScope,
    );
  }

  /**
   * The load balancer registrations the request declared.
   */
  private static registrationsOf(
    declared: readonly SimEcsServiceLoadBalancer[],
    accountRegionScope: SimAwsAccountRegionScope,
  ): readonly SimEcsServiceRegistration[] {
    return declared.map(
      (loadBalancer) =>
        new SimEcsServiceRegistration(loadBalancer, accountRegionScope),
    );
  }

  /**
   * The scheduling strategy the request asked for, which has to be `REPLICA`.
   *
   * `DAEMON` runs one task on every container instance in the cluster. There
   * are no instances here to run one each, so answering it as though it had
   * been applied would be reporting a replica service under another name.
   */
  private static acceptedStrategy(strategy: string | undefined): void {
    if (
      strategy !== undefined &&
      strategy !== simEcsReplicaSchedulingStrategy
    ) {
      throw new SimEcsInvalidParameterException(
        `schedulingStrategy ${strategy} is not simulated. There are no ` +
          `container instances here for a task to be placed on each of.`,
      );
    }
  }

  /**
   * How many tasks the request asked for, which a replica service needs.
   */
  private static requiredCount(count: number | undefined): number {
    if (count === undefined) {
      throw new SimEcsInvalidParameterException(
        "CreateService needs a desiredCount, which is how many tasks the " +
          "service keeps running.",
      );
    }

    return count;
  }
}
