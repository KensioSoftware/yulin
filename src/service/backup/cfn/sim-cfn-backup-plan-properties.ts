import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimBackupPlanInput,
  SimBackupRuleInput,
} from "../command/sim-backup-command.types.js";
import { SimCfnBackupPropertyReader } from "./sim-cfn-backup-property-reader.js";

/** Reads a backup plan and its nested rules from CloudFormation properties. */
export class SimCfnBackupPlanProperties extends SimCfnBackupPropertyReader {
  constructor(
    resource: SimCfnResource,
    private readonly plan: SimCfnTemplateValueRecord,
  ) {
    super(resource, plan);
  }

  read(): SimBackupPlanInput {
    const rules = this.recordValue(this.plan, "BackupPlanRule");
    if (!Array.isArray(rules)) {
      throw this.error("BackupPlan.BackupPlanRule must be an array");
    }
    return {
      BackupPlanName: this.requiredRecordString(this.plan, "BackupPlanName"),
      Rules: rules.map((rule, index) => this.backupRule(rule, index)),
    };
  }

  private backupRule(
    value: SimCfnTemplateValue,
    index: number,
  ): SimBackupRuleInput {
    const rule = this.record(value, `BackupPlanRule[${String(index)}]`);
    const lifecycleValue = this.recordValue(rule, "Lifecycle");
    const lifecycle =
      lifecycleValue === undefined
        ? undefined
        : this.record(lifecycleValue, "Lifecycle");
    return {
      RuleName: this.requiredRecordString(rule, "RuleName"),
      TargetBackupVaultName: this.requiredRecordString(
        rule,
        "TargetBackupVault",
      ),
      ScheduleExpression: this.optionalString(
        this.recordValue(rule, "ScheduleExpression"),
        "ScheduleExpression",
      ),
      Lifecycle:
        lifecycle === undefined
          ? undefined
          : {
              DeleteAfterDays: this.optionalNumber(
                this.recordValue(lifecycle, "DeleteAfterDays"),
                "DeleteAfterDays",
              ),
              MoveToColdStorageAfterDays: this.optionalNumber(
                this.recordValue(lifecycle, "MoveToColdStorageAfterDays"),
                "MoveToColdStorageAfterDays",
              ),
            },
    };
  }
}
