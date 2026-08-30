import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * A refusal naming the Resource whose properties could not be read.
 */
export function metricFilterPropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid sim CloudWatch Logs CloudFormation Resource ${logicalId}: ${reason}`,
  );
}

/**
 * Read a template value that has to be an object.
 */
export function metricFilterRecord(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
  name: string,
): SimCfnTemplateValueRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw metricFilterPropertyError(logicalId, `${name} must be an object`);
  }

  return value;
}

/**
 * Read a template value that has to be a list.
 */
export function metricFilterList(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
  name: string,
): readonly SimCfnTemplateValue[] {
  if (!Array.isArray(value)) {
    throw metricFilterPropertyError(logicalId, `${name} must be a list`);
  }

  return value;
}

/**
 * Read an optional template value that has to be a string.
 */
export function metricFilterString(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw metricFilterPropertyError(logicalId, `${name} must be a string`);
  }

  return value;
}

/**
 * Read an optional template value that has to be a number.
 */
export function metricFilterNumber(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number") {
    throw metricFilterPropertyError(logicalId, `${name} must be a number`);
  }

  return value;
}

/**
 * Read a template value the Resource cannot be created without.
 */
export function metricFilterRequiredString(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
  name: string,
): string {
  const read = metricFilterString(logicalId, value, name);

  if (read === undefined) {
    throw metricFilterPropertyError(logicalId, `${name} is required`);
  }

  return read;
}
