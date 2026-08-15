import type { SimArn } from "../../aws/arn.js";
import type {
  SimEcsServiceDetail,
  SimEcsServiceLoadBalancer,
  SimEcsServiceStatus,
} from "./sim-ecs-service-detail.js";
import {
  SimEcsServiceIdentity,
  type SimEcsServiceIdentityProperties,
} from "./sim-ecs-service-identity.js";
import { SimEcsServiceTaskSet } from "./sim-ecs-service-task-set.js";

interface SimEcsServiceProperties extends SimEcsServiceIdentityProperties {
  readonly taskDefinitionArn: SimArn;
  readonly desiredCount: number;
}

/**
 * The scheduling strategy every simulated service runs under.
 *
 * `DAEMON` means one task per container instance, and there are no instances
 * here to have one each, so a request asking for it is refused rather than run
 * as a replica service under another name.
 */
export const simEcsReplicaSchedulingStrategy = "REPLICA";

/**
 * One simulated ECS service.
 *
 * A service is a desired count of tasks from a task definition, kept running in
 * a cluster. The count is state rather than concurrency: Yulin runs in one
 * Node.js process and there are no containers to copy, so a desired count of
 * three means three simulated tasks reported as running, while the handler
 * bound to a container is called once per request or per poll.
 *
 * What the service is and what it is being kept at are kept apart, in its
 * identity and here, because only the second of them ever changes. The tasks it
 * is keeping are held in its own task set, which is where the running and
 * pending counts are read from: whatever starts and stops them hands them over
 * and takes them back, so nothing here schedules anything.
 */
export class SimEcsService {
  public readonly tasks = new SimEcsServiceTaskSet();

  #taskDefinitionArn: SimArn;
  #desiredCount: number;
  #status: SimEcsServiceStatus = "ACTIVE";

  private readonly identity: SimEcsServiceIdentity;

  constructor(properties: SimEcsServiceProperties) {
    this.identity = new SimEcsServiceIdentity(properties);
    this.#taskDefinitionArn = properties.taskDefinitionArn;
    this.#desiredCount = properties.desiredCount;
  }

  /** The name this service is named by within its cluster. */
  get serviceName(): string {
    return this.identity.serviceName;
  }

  /** The ARN this service is named by anywhere outside its cluster. */
  get serviceArn(): SimArn {
    return this.identity.serviceArn;
  }

  /** The cluster this service runs in. */
  get clusterName(): string {
    return this.identity.clusterName;
  }

  /** The launch type this service was created with, where one was given. */
  get launchType(): string | undefined {
    return this.identity.launchType;
  }

  /**
   * The load balancers this service was created with.
   *
   * Held as they were declared and not acted on: nothing here sends a service
   * container a request yet, so this is what a target group reads to find the
   * service that is meant to answer for it.
   */
  get loadBalancers(): readonly SimEcsServiceLoadBalancer[] {
    return this.identity.loadBalancers;
  }

  /** The revision this service is currently running. */
  get taskDefinitionArn(): SimArn {
    return this.#taskDefinitionArn;
  }

  /** How many tasks this service is being kept at. */
  get desiredCount(): number {
    return this.#desiredCount;
  }

  /**
   * Whether this service is still the one a request naming it reaches.
   */
  isActive(): boolean {
    return this.#status === "ACTIVE";
  }

  /**
   * Keep this service at a different number of tasks.
   */
  scaleTo(desiredCount: number): void {
    this.#desiredCount = desiredCount;
  }

  /**
   * Move this service onto another task definition revision.
   */
  moveTo(taskDefinitionArn: SimArn): void {
    this.#taskDefinitionArn = taskDefinitionArn;
  }

  /**
   * Mark this service deleted.
   *
   * It stays describable as `INACTIVE` rather than being removed, which is what
   * real ECS does with a deleted service: something holding its ARN can still
   * find out what became of it. Its desired count goes to zero, because a
   * deleted service is keeping nothing running.
   */
  markDeleted(): void {
    this.#status = "INACTIVE";
    this.#desiredCount = 0;
  }

  /**
   * This service as `DescribeServices` reports it.
   */
  toOutput(): SimEcsServiceDetail {
    return {
      ...this.identity.toOutput(),
      status: this.#status,
      desiredCount: this.#desiredCount,
      runningCount: this.tasks.runningCount,
      pendingCount: this.tasks.pendingCount,
      taskDefinition: this.#taskDefinitionArn,
      schedulingStrategy: simEcsReplicaSchedulingStrategy,
    };
  }
}
