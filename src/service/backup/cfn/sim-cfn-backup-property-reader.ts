import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnBackupResourceError } from "./sim-cfn-backup-resource-error.js";

/** Provides typed access to AWS Backup CloudFormation properties. */
export class SimCfnBackupPropertyReader {
  protected readonly values: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(
    protected readonly resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ) {
    this.values = new Map(Object.entries(properties));
  }

  protected requiredString(name: string): string {
    const value = this.string(name);
    if (value === undefined || value.length === 0) {
      throw this.error(`${name} is required`);
    }
    return value;
  }

  protected string(name: string): string | undefined {
    return this.optionalString(this.values.get(name), name);
  }

  protected optionalString(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw this.error(`${name} must be a string`);
    return value;
  }

  protected requiredRecordString(
    record: SimCfnTemplateValueRecord,
    name: string,
  ): string {
    const value = this.optionalString(this.recordValue(record, name), name);
    if (value === undefined || value.length === 0) {
      throw this.error(`${name} is required`);
    }
    return value;
  }

  protected optionalNumber(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "number") throw this.error(`${name} must be a number`);
    return value;
  }

  protected stringArray(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): readonly string[] | undefined {
    if (value === undefined) return undefined;
    if (
      !Array.isArray(value) ||
      !value.every((item): item is string => typeof item === "string")
    ) {
      throw this.error(`${name} must be an array of strings`);
    }
    return value;
  }

  protected record(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): SimCfnTemplateValueRecord {
    if (!isRecord(value)) throw this.error(`${name} must be an object`);
    return value;
  }

  protected recordValue(
    record: SimCfnTemplateValueRecord,
    name: string,
  ): SimCfnTemplateValue | undefined {
    return new Map(Object.entries(record)).get(name);
  }

  protected error(reason: string): Error {
    return simCfnBackupResourceError(
      this.resource.type ?? "AWS::Backup::Unknown",
      this.resource.logicalId,
      reason,
    );
  }
}
