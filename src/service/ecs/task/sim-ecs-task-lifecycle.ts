import type {
  SimEcsTaskDesiredStatus,
  SimEcsTaskDetail,
  SimEcsTaskStatus,
  SimEcsTaskStopCode,
} from "./sim-ecs-task-detail.js";

/**
 * How a task stopped.
 */
export interface SimEcsTaskStop {
  readonly at: Date;
  readonly stopCode: SimEcsTaskStopCode;
  readonly reason: string;
}

/**
 * The part of a described task that says where it has got to.
 */
type SimEcsTaskLifecycleDetail = Pick<
  SimEcsTaskDetail,
  | "lastStatus"
  | "desiredStatus"
  | "startedAt"
  | "stoppedAt"
  | "stopCode"
  | "stoppedReason"
>;

/**
 * Where one simulated ECS task has got to.
 *
 * Stopping is recorded once. A task asked to stop keeps the reason the request
 * gave rather than having it replaced by whatever the run would have said, so
 * a test can tell a task it stopped from one that finished on its own.
 */
export class SimEcsTaskLifecycle {
  #lastStatus: SimEcsTaskStatus = "PROVISIONING";
  #desiredStatus: SimEcsTaskDesiredStatus = "RUNNING";
  #startedAt: Date | undefined;
  #stoppedAt: Date | undefined;
  #stopCode: SimEcsTaskStopCode | undefined;
  #stoppedReason: string | undefined;

  /**
   * The state the task is being kept in.
   */
  get desiredStatus(): SimEcsTaskDesiredStatus {
    return this.#desiredStatus;
  }

  /**
   * Whether the task has already finished.
   */
  get isStopped(): boolean {
    return this.#lastStatus === "STOPPED";
  }

  /**
   * Whether something has asked the task to stop.
   */
  get isStopRequested(): boolean {
    return this.#desiredStatus === "STOPPED";
  }

  /**
   * Mark the task as running its containers.
   */
  start(at: Date): void {
    this.#lastStatus = "RUNNING";
    this.#startedAt = at;
  }

  /**
   * Record that something asked the task to stop.
   *
   * Only the desired status changes here. The task reaches `STOPPED` when the
   * run gets to it, as it does on real ECS, where the desired status is what
   * the request sets and the last status follows.
   */
  requestStop(reason: string): void {
    if (this.isStopped) {
      return;
    }

    this.#desiredStatus = "STOPPED";
    this.#stopCode = "UserInitiated";
    this.#stoppedReason = reason;
  }

  /**
   * Mark the task stopped, keeping any reason already recorded for it.
   */
  stop(stopped: SimEcsTaskStop): void {
    this.#lastStatus = "STOPPED";
    this.#desiredStatus = "STOPPED";
    this.#stoppedAt = stopped.at;
    this.#stopCode ??= stopped.stopCode;
    this.#stoppedReason ??= stopped.reason;
  }

  /**
   * This part of the task as `DescribeTasks` reports it.
   */
  toOutput(): SimEcsTaskLifecycleDetail {
    return {
      lastStatus: this.#lastStatus,
      desiredStatus: this.#desiredStatus,
      ...(this.#startedAt !== undefined && { startedAt: this.#startedAt }),
      ...(this.#stoppedAt !== undefined && { stoppedAt: this.#stoppedAt }),
      ...(this.#stopCode !== undefined && { stopCode: this.#stopCode }),
      ...(this.#stoppedReason !== undefined && {
        stoppedReason: this.#stoppedReason,
      }),
    };
  }
}
