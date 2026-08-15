import type { SimEcsTaskDesiredStatus } from "./sim-ecs-task-detail.js";
import type { SimEcsTask } from "./sim-ecs-task.js";

/**
 * What a `ListTasks` request asked to be listed.
 *
 * The desired status is always set, because real ECS filters on `RUNNING` when
 * a request says nothing. A task that has finished is therefore not in a
 * listing unless the request asked for the stopped ones.
 */
export interface SimEcsTaskListing {
  readonly clusterName: string;
  readonly desiredStatus: SimEcsTaskDesiredStatus;
  readonly family?: string | undefined;
  readonly startedBy?: string | undefined;
  readonly launchType?: string | undefined;
}

/**
 * The simulated ECS tasks one Account and Region holds.
 *
 * Tasks are kept once they stop rather than removed, because a stopped task is
 * what a test reads to find out what ran. Real ECS keeps one for about an hour
 * after it stops; nothing here expires, so a stopped task lasts as long as the
 * simulation does.
 */
export class SimEcsTaskStore {
  private readonly tasksById = new Map<string, SimEcsTask>();

  private static matches(
    task: SimEcsTask,
    listing: SimEcsTaskListing,
  ): boolean {
    return (
      task.clusterName === listing.clusterName &&
      task.desiredStatus === listing.desiredStatus &&
      this.matchesOptional(task.family, listing.family) &&
      this.matchesOptional(task.startedBy, listing.startedBy) &&
      this.matchesOptional(task.launchType, listing.launchType)
    );
  }

  /**
   * Whether a filter the request left out, or matched, holds for a task.
   */
  private static matchesOptional(
    value: string | undefined,
    filter: string | undefined,
  ): boolean {
    return filter === undefined || filter === value;
  }

  /**
   * Hold a task that has just been started.
   */
  put(task: SimEcsTask): void {
    this.tasksById.set(task.taskId, task);
  }

  /**
   * Find a task by its id, whether it is running or stopped.
   */
  find(taskId: string): SimEcsTask | undefined {
    return this.tasksById.get(taskId);
  }

  /**
   * The tasks of one cluster a listing asked for, oldest first.
   */
  list(listing: SimEcsTaskListing): readonly SimEcsTask[] {
    return this.tasksById
      .values()
      .filter((task) => SimEcsTaskStore.matches(task, listing))
      .toArray();
  }
}
