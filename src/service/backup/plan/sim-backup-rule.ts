import { randomUUID } from "node:crypto";

import { awsCronFieldSpecs } from "../../../util/schedule/cron/sim-cron-field-spec.js";
import { SimSchedule } from "../../../util/schedule/sim-schedule.js";
import type { SimScheduleDialect } from "../../../util/schedule/sim-schedule-dialect.js";
import { SimScheduleExpressionError } from "../../../util/schedule/sim-schedule.error.js";
import type {
  SimBackupRule,
  SimBackupRuleInput,
} from "../command/sim-backup-command.types.js";
import { requiredString } from "../command/sim-backup-required-string.js";
import {
  SimBackupInvalidParameterValueException,
  SimBackupMissingParameterValueException,
} from "../error/sim-backup.error.js";

export const defaultBackupScheduleExpression = "cron(0 5 ? * * *)";

/** Defines the AWS Backup cron dialect used by plan rules. */
export const backupScheduleDialect: SimScheduleDialect = {
  cronFields: awsCronFieldSpecs,
  requiresRateAgreement: true,
  allowsOneTime: false,
};

/** Reads and validates the rules in a backup plan. */
export function readBackupRules(
  input: readonly SimBackupRuleInput[] | undefined,
): readonly SimBackupRule[] {
  if (input === undefined || input.length === 0) {
    throw new SimBackupMissingParameterValueException(
      "BackupPlan.Rules must contain at least one rule",
    );
  }

  return input.map((rule) => readBackupRule(rule));
}

/** Validates and normalizes one backup plan rule for storage. */
function readBackupRule(input: SimBackupRuleInput): SimBackupRule {
  const schedule = input.ScheduleExpression ?? defaultBackupScheduleExpression;
  validateSchedule(schedule);
  const lifecycle = readBackupLifecycle(input.Lifecycle);

  return {
    RuleId: randomUUID(),
    RuleName: requiredString(input.RuleName, "RuleName"),
    TargetBackupVaultName: requiredString(
      input.TargetBackupVaultName,
      "TargetBackupVaultName",
    ),
    ScheduleExpression: schedule,
    Lifecycle: lifecycle,
  };
}

/** Rejects expressions outside the AWS Backup schedule dialect. */
function validateSchedule(schedule: string): void {
  try {
    SimSchedule.of(schedule, backupScheduleDialect);
  } catch (error) {
    if (error instanceof SimScheduleExpressionError) {
      throw new SimBackupInvalidParameterValueException(error.message);
    }
    throw error;
  }
}

/** Enforces the relationship between cold storage and deletion. */
export function readBackupLifecycle(
  lifecycle: SimBackupRuleInput["Lifecycle"],
): SimBackupRuleInput["Lifecycle"] {
  const coldAfter = lifecycle?.MoveToColdStorageAfterDays;
  const deleteAfter = lifecycle?.DeleteAfterDays;
  const retainedIndefinitely = coldAfter === -1 && deleteAfter === -1;

  for (const [name, days] of [
    ["MoveToColdStorageAfterDays", coldAfter],
    ["DeleteAfterDays", deleteAfter],
  ] as const) {
    if (
      days !== undefined &&
      days !== -1 &&
      (!Number.isSafeInteger(days) || days < 1 || days > 36_500)
    ) {
      throw new SimBackupInvalidParameterValueException(
        `${name} must be between 1 and 36500`,
      );
    }
  }

  if (!retainedIndefinitely && (coldAfter === -1 || deleteAfter === -1)) {
    throw new SimBackupInvalidParameterValueException(
      "MoveToColdStorageAfterDays and DeleteAfterDays must both be -1",
    );
  }

  if (
    !retainedIndefinitely &&
    coldAfter !== undefined &&
    deleteAfter !== undefined &&
    deleteAfter < coldAfter + 90
  ) {
    throw new SimBackupInvalidParameterValueException(
      "DeleteAfterDays must be at least 90 days after MoveToColdStorageAfterDays",
    );
  }

  return lifecycle === undefined ? undefined : { ...lifecycle };
}
