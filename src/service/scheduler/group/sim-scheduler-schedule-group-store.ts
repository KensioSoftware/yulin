import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimSchedulerResourceNotFoundException } from "../error/sim-scheduler.error.js";
import { defaultScheduleGroupName } from "../schedule/sim-scheduler-schedule-name.js";
import { SimSchedulerScheduleGroup } from "./sim-scheduler-schedule-group.js";

interface SimSchedulerScheduleGroupStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * The schedule groups of one simulated Scheduler scope.
 *
 * This store builds its own groups rather than taking them from a writer, which
 * is the opposite of how schedules are handled. A schedule is read out of a
 * request carrying a dozen properties, and reading it in one place is what
 * keeps Create and Update agreeing. A group is a name and two timestamps. A
 * writer beside this would be a class that exists to call a constructor.
 */
export class SimSchedulerScheduleGroupStore {
  private readonly groups = new Map<string, SimSchedulerScheduleGroup>();
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: SimClock;

  constructor(properties: SimSchedulerScheduleGroupStoreProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;

    this.create(defaultScheduleGroupName);
  }

  /**
   * Every group in this scope, in creation order.
   *
   * `default` is always the first of them. Every Account has it without anyone
   * creating one, so this scope starts with it too.
   */
  get all(): readonly SimSchedulerScheduleGroup[] {
    return this.groups.values().toArray();
  }

  /**
   * Create a group, stamped from the simulation's clock.
   */
  create(groupName: string): SimSchedulerScheduleGroup {
    const group = new SimSchedulerScheduleGroup({
      name: groupName,
      accountRegionScope: this.accountRegionScope,
      createdAt: this.clock.now(),
    });

    this.groups.set(groupName, group);

    return group;
  }

  /**
   * Find a group by name.
   */
  find(groupName: string): SimSchedulerScheduleGroup | undefined {
    return this.groups.get(groupName);
  }

  /**
   * Resolve a group by name, or refuse.
   */
  require(groupName: string): SimSchedulerScheduleGroup {
    const found = this.find(groupName);

    if (found === undefined) {
      throw new SimSchedulerResourceNotFoundException(
        `Schedule group ${groupName} does not exist.`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted group.
   */
  remove(group: SimSchedulerScheduleGroup): void {
    this.groups.delete(group.name);
  }
}
