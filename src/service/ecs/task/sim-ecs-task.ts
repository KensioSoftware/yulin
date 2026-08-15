import type { SimArn } from "../../aws/arn.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimEcsTaskContainer } from "./sim-ecs-task-container.js";
import type {
  SimEcsTaskDesiredStatus,
  SimEcsTaskDetail,
  SimEcsTaskStatus,
} from "./sim-ecs-task-detail.js";
import {
  SimEcsTaskIdentity,
  type SimEcsTaskIdentityProperties,
} from "./sim-ecs-task-identity.js";
import {
  SimEcsTaskLifecycle,
  type SimEcsTaskStop,
} from "./sim-ecs-task-lifecycle.js";

interface SimEcsTaskProperties extends SimEcsTaskIdentityProperties {
  readonly containers: readonly SimEcsTaskContainer[];
}

/**
 * One simulated ECS task.
 *
 * A task holds what ran and what came of it. It is created by `RunTask`,
 * starts once the simulator's background work reaches it, and stops when its
 * containers have finished or when `StopTask` asks it to.
 *
 * What a task is and where it has got to are kept apart, in its identity and
 * its lifecycle, because only the second of them ever changes.
 */
export class SimEcsTask {
  public readonly containers: readonly SimEcsTaskContainer[];

  private readonly identity: SimEcsTaskIdentity;
  private readonly lifecycle = new SimEcsTaskLifecycle();

  constructor(properties: SimEcsTaskProperties) {
    this.identity = new SimEcsTaskIdentity(properties);
    this.containers = properties.containers;
  }

  /** The id this task is named by, without its ARN around it. */
  get taskId(): string {
    return this.identity.taskId;
  }

  /** The ARN this task is named by. */
  get taskArn(): SimArn {
    return this.identity.taskArn;
  }

  /** The cluster this task runs in. */
  get clusterName(): string {
    return this.identity.clusterName;
  }

  /** The task definition family this task was started from. */
  get family(): string {
    return this.identity.family;
  }

  /** What started this task, where the request said. */
  get startedBy(): string | undefined {
    return this.identity.startedBy;
  }

  /** The launch type this task was started with, where the request said. */
  get launchType(): string | undefined {
    return this.identity.launchType;
  }

  /** The service keeping this task running, where one is. */
  get serviceName(): string | undefined {
    return this.identity.serviceName;
  }

  /** The state this task is being kept in. */
  get desiredStatus(): SimEcsTaskDesiredStatus {
    return this.lifecycle.desiredStatus;
  }

  /** Where this task has actually got to. */
  get lastStatus(): SimEcsTaskStatus {
    return this.lifecycle.lastStatus;
  }

  /**
   * Whether something has asked this task to stop.
   *
   * The run checks this before each container, so a task stopped before its
   * containers reach it runs none of them, and one stopped part way through
   * runs no more.
   */
  get isStopRequested(): boolean {
    return this.lifecycle.isStopRequested;
  }

  /**
   * This task's record of one of the containers its definition declared.
   */
  container(name: string): SimEcsTaskContainer {
    const container = this.containers.find(
      (candidate) => candidate.name === name,
    );

    assertDefined(container, `Task ${this.taskId} holds no container ${name}`);

    return container;
  }

  /**
   * Mark this task as running its containers.
   */
  start(at: Date): void {
    this.lifecycle.start(at);
  }

  /**
   * Record that something asked this task to stop.
   */
  requestStop(reason: string): void {
    this.lifecycle.requestStop(reason);
  }

  /**
   * Stop this task without it ever having started its containers.
   *
   * A secret the task could not pull is what does this. The whole task carries
   * the reason and so does every container, because a real resource
   * initialization error happens while the task is still provisioning rather
   * than to one container of it.
   */
  failToStart(at: Date, reason: string): void {
    for (const container of this.containers) {
      container.neverStarted(reason);
    }

    this.stop({ at, stopCode: "TaskFailedToStart", reason });
  }

  /**
   * Mark this task stopped, keeping any reason already recorded for it.
   */
  stop(stopped: SimEcsTaskStop): void {
    this.lifecycle.stop(stopped);
  }

  /**
   * This task as `DescribeTasks` reports it.
   */
  toOutput(): SimEcsTaskDetail {
    return {
      ...this.identity.toOutput(),
      ...this.lifecycle.toOutput(),
      containers: this.containers.map((container) => container.toOutput()),
    };
  }
}
