import type { BackgroundScheduler } from "../../../util/background/background.js";
import { SimSchedule } from "../../../util/schedule/sim-schedule.js";
import type { SimBackupRule } from "../command/sim-backup-command.types.js";
import type { SimBackupJobs } from "../job/sim-backup-jobs.js";
import type { SimBackupStore } from "../sim-backup-store.js";
import type { SimBackupPlan } from "./sim-backup-plan.js";
import { backupScheduleDialect } from "./sim-backup-rule.js";

interface SimBackupPlanSchedulesProperties {
  readonly store: SimBackupStore;
  readonly jobs: SimBackupJobs;
  readonly background: BackgroundScheduler;
}

/** Runs backup plan rules when simulated time reaches their schedules. */
export class SimBackupPlanSchedules {
  private readonly store: SimBackupStore;
  private readonly jobs: SimBackupJobs;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimBackupPlanSchedulesProperties) {
    this.store = properties.store;
    this.jobs = properties.jobs;
    this.background = properties.background;
  }

  arm(plan: SimBackupPlan): void {
    for (const rule of plan.rules) {
      const schedule = SimSchedule.of(
        rule.ScheduleExpression,
        backupScheduleDialect,
      );
      this.armAfter(plan, rule, schedule, this.background.now());
    }
  }

  private armAfter(
    plan: SimBackupPlan,
    rule: SimBackupRule,
    schedule: SimSchedule,
    after: Date,
  ): void {
    const due = schedule.nextAfter(after);
    if (due === undefined) {
      return;
    }

    this.background.scheduleAt(due, () => {
      this.fire(plan, rule, schedule, due);
      return Promise.resolve();
    });
  }

  private fire(
    plan: SimBackupPlan,
    rule: SimBackupRule,
    schedule: SimSchedule,
    due: Date,
  ): void {
    if (this.store.plan(plan.id) !== plan) {
      return;
    }

    const vault = this.store.vault(rule.TargetBackupVaultName);
    if (vault !== undefined) {
      for (const [resourceArn, iamRoleArn] of this.selectedResources(plan)) {
        this.jobs.start({
          vault,
          resourceArn,
          iamRoleArn,
          at: due,
          lifecycle: rule.Lifecycle,
          createdBy: {
            BackupPlanId: plan.id,
            BackupPlanArn: plan.arn,
            BackupPlanName: plan.name,
            BackupPlanVersion: plan.versionId,
            BackupRuleId: rule.RuleId,
            BackupRuleName: rule.RuleName,
          },
        });
      }
    }

    this.armAfter(plan, rule, schedule, due);
  }

  private selectedResources(plan: SimBackupPlan): ReadonlyMap<string, string> {
    const selected = new Map<string, string>();
    for (const selection of this.store.selectionsForPlan(plan.id)) {
      for (const resourceArn of selection.resources) {
        if (!selected.has(resourceArn)) {
          selected.set(resourceArn, selection.iamRoleArn);
        }
      }
    }
    return selected;
  }
}
