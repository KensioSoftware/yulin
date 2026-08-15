import { parseSimArn } from "../../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcsServiceLoadBalancer } from "../sim-ecs-service-detail.js";

/**
 * The service an ARN has to name for a service to register into it.
 */
const targetGroupResourceType = "targetgroup";

/**
 * The ports a target can be registered on, which are every port there is.
 */
const portRange = { lowest: 1, highest: 65_535 } as const;

/**
 * One load balancer registration a service was created with, read once.
 *
 * A registration is three things together: the target group tasks are
 * registered into, the container that answers for it, and the port that
 * container was declared to listen on. Real ECS requires all three, and each
 * is refused here when it is missing rather than leaving a service that looks
 * registered and answers nothing.
 *
 * The target group has to be in the service's own Account and Region. Real ECS
 * requires that too, and here it is what makes the registration reachable from
 * both ends: the tasks are registered into that scope's target group, and a
 * request routed to that target group finds this service in the same place.
 */
export class SimEcsServiceRegistration {
  public readonly targetGroupArn: string;
  public readonly containerName: string;
  public readonly containerPort: number;

  constructor(
    declared: SimEcsServiceLoadBalancer,
    accountRegionScope: SimAwsAccountRegionScope,
  ) {
    SimEcsServiceRegistration.refuseLoadBalancerName(declared);
    this.targetGroupArn = SimEcsServiceRegistration.requiredTargetGroupArn(
      declared,
      accountRegionScope,
    );
    this.containerName = SimEcsServiceRegistration.requiredContainerName(
      declared,
      this.targetGroupArn,
    );
    this.containerPort = SimEcsServiceRegistration.requiredContainerPort(
      declared,
      this.targetGroupArn,
    );
  }

  /**
   * Refuse a registration with a Classic Load Balancer.
   *
   * `loadBalancerName` is the Classic Load Balancer form, which routes below
   * the Application Load Balancer this simulation has, so a service naming one
   * is refused rather than registered into something else.
   */
  private static refuseLoadBalancerName(
    declared: SimEcsServiceLoadBalancer,
  ): void {
    if (declared.loadBalancerName !== undefined) {
      throw new SimEcsInvalidParameterException(
        `A service load balancer naming loadBalancerName ` +
          `'${declared.loadBalancerName}' registers with a Classic Load ` +
          `Balancer, which is not simulated. Name a targetGroupArn instead.`,
      );
    }
  }

  private static requiredTargetGroupArn(
    declared: SimEcsServiceLoadBalancer,
    accountRegionScope: SimAwsAccountRegionScope,
  ): string {
    const { targetGroupArn } = declared;

    if (targetGroupArn === undefined || targetGroupArn === "") {
      throw new SimEcsInvalidParameterException(
        "A service load balancer needs a targetGroupArn, which is the target " +
          "group its tasks are registered into.",
      );
    }

    const parts = parseSimArn(targetGroupArn);

    if (parts?.resourceType !== targetGroupResourceType) {
      throw new SimEcsInvalidParameterException(
        `'${targetGroupArn}' is not a target group ARN.`,
      );
    }

    if (
      parts.accountId !== accountRegionScope.accountId ||
      parts.region !== accountRegionScope.regionName
    ) {
      throw new SimEcsInvalidParameterException(
        `The target group ${targetGroupArn} is in another Account or Region ` +
          `than the service, which is ${accountRegionScope.accountId} in ` +
          `${accountRegionScope.regionName}. A service registers into a ` +
          `target group of its own Account and Region.`,
      );
    }

    return targetGroupArn;
  }

  private static requiredContainerName(
    declared: SimEcsServiceLoadBalancer,
    targetGroupArn: string,
  ): string {
    const { containerName } = declared;

    if (containerName === undefined || containerName === "") {
      throw new SimEcsInvalidParameterException(
        `The registration into ${targetGroupArn} needs a containerName, ` +
          `which is the container of the task that answers for it.`,
      );
    }

    return containerName;
  }

  private static requiredContainerPort(
    declared: SimEcsServiceLoadBalancer,
    targetGroupArn: string,
  ): number {
    const { containerPort } = declared;

    if (containerPort === undefined) {
      throw new SimEcsInvalidParameterException(
        `The registration into ${targetGroupArn} needs a containerPort, ` +
          `which is the port its tasks are registered on.`,
      );
    }

    if (
      !Number.isSafeInteger(containerPort) ||
      containerPort < portRange.lowest ||
      containerPort > portRange.highest
    ) {
      throw new SimEcsInvalidParameterException(
        `The registration into ${targetGroupArn} states a containerPort of ` +
          `${String(containerPort)}, which is not a port between ` +
          `${String(portRange.lowest)} and ${String(portRange.highest)}. ` +
          `A target is registered on the port, so a port nothing could ` +
          `listen on registers nothing.`,
      );
    }

    return containerPort;
  }

  /**
   * This registration as a described service reports it.
   */
  toOutput(): SimEcsServiceLoadBalancer {
    return {
      targetGroupArn: this.targetGroupArn,
      containerName: this.containerName,
      containerPort: this.containerPort,
    };
  }
}
