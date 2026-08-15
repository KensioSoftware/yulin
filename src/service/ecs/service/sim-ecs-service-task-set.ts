import type { SimEcsTask } from "../task/sim-ecs-task.js";

/**
 * The tasks one simulated ECS service is keeping running.
 *
 * A service holds its tasks rather than looking them up, because the counts it
 * reports are read from them and because the ones it is keeping are not the
 * same as the ones the cluster has ever held: a task it stopped stays in the
 * task store and leaves here.
 *
 * Whatever starts and stops tasks takes them from here to stop them, so this
 * knows nothing about how a task is started or what stopping one means.
 */
export class SimEcsServiceTaskSet {
  readonly #tasks: SimEcsTask[] = [];

  /** How many tasks are held, started or not. */
  get count(): number {
    return this.#tasks.length;
  }

  /** How many of them have reached `RUNNING`. */
  get runningCount(): number {
    return this.countOf("RUNNING");
  }

  /** How many of them have yet to start. */
  get pendingCount(): number {
    return this.countOf("PROVISIONING");
  }

  /**
   * Take on a task started for the service.
   */
  add(task: SimEcsTask): void {
    this.#tasks.push(task);
  }

  /**
   * Give up the newest tasks held, so they can be stopped.
   *
   * The newest go first because they are the ones a scale-in is undoing, and
   * because a test that read about a service's tasks expects the ones it has
   * already seen to be the ones still there.
   */
  takeNewest(count: number): readonly SimEcsTask[] {
    return this.#tasks.splice(Math.max(this.#tasks.length - count, 0));
  }

  /**
   * Give up every task held, so they can be stopped.
   */
  takeAll(): readonly SimEcsTask[] {
    return this.takeNewest(this.#tasks.length);
  }

  private countOf(status: string): number {
    return this.#tasks.filter((task) => task.lastStatus === status).length;
  }
}
