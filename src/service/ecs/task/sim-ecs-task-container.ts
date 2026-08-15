import type { SimArn } from "../../aws/arn.js";

/**
 * The states one container of a simulated task passes through.
 */
export type SimEcsTaskContainerStatus = "PENDING" | "RUNNING" | "STOPPED";

/**
 * Minimal structural sim ECS described container.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Container.html
 */
export interface SimEcsTaskContainerDetail {
  readonly containerArn?: SimArn | undefined;
  readonly taskArn?: SimArn | undefined;
  readonly name?: string | undefined;
  readonly image?: string | undefined;
  readonly lastStatus?: SimEcsTaskContainerStatus | undefined;
  readonly exitCode?: number | undefined;
  readonly reason?: string | undefined;
}

interface SimEcsTaskContainerProperties {
  readonly containerArn: SimArn;
  readonly taskArn: SimArn;
  readonly name: string;
  readonly image: string;
}

/**
 * The exit code a container that threw reports.
 *
 * A Node.js process that ends on an uncaught error exits with 1, and a handler
 * that throws is the same thing happening in this process.
 */
const failedExitCode = 1;

/**
 * One container of one simulated ECS task.
 *
 * A container either ran or it did not. One with an executable binding runs
 * its handler and ends with an exit code, and one without never starts and
 * says why in its reason. Both are reported, because a task definition holding
 * a log router next to an application container is the ordinary case, and a
 * container Yulin cannot run is not a failure of the task.
 */
export class SimEcsTaskContainer {
  public readonly containerArn: SimArn;
  public readonly taskArn: SimArn;
  public readonly name: string;
  public readonly image: string;

  #lastStatus: SimEcsTaskContainerStatus = "PENDING";
  #exitCode: number | undefined;
  #reason: string | undefined;

  constructor(properties: SimEcsTaskContainerProperties) {
    this.containerArn = properties.containerArn;
    this.taskArn = properties.taskArn;
    this.name = properties.name;
    this.image = properties.image;
  }

  /**
   * Whether this container's handler ran, whatever came of it.
   */
  get ran(): boolean {
    return this.#exitCode !== undefined;
  }

  /**
   * Mark this container's handler as running.
   */
  start(): void {
    this.#lastStatus = "RUNNING";
  }

  /**
   * Mark this container as having run to completion.
   */
  exited(): void {
    this.#lastStatus = "STOPPED";
    this.#exitCode = 0;
  }

  /**
   * Mark this container as having ended on an error it threw.
   */
  failedWith(reason: string): void {
    this.#lastStatus = "STOPPED";
    this.#exitCode = failedExitCode;
    this.#reason = reason;
  }

  /**
   * Mark this container as one that never started, and say why.
   *
   * Two things get here: a container nothing is bound to, and a container of a
   * task that could not pull its secrets. Neither carries an exit code, which
   * is the difference between a container that ran and exited zero and one
   * whose handler was never called.
   */
  neverStarted(reason: string): void {
    this.#lastStatus = "STOPPED";
    this.#reason = reason;
  }

  /**
   * This container as `DescribeTasks` reports it.
   */
  toOutput(): SimEcsTaskContainerDetail {
    return {
      containerArn: this.containerArn,
      taskArn: this.taskArn,
      name: this.name,
      image: this.image,
      lastStatus: this.#lastStatus,
      ...(this.#exitCode !== undefined && { exitCode: this.#exitCode }),
      ...(this.#reason !== undefined && { reason: this.#reason }),
    };
  }
}
