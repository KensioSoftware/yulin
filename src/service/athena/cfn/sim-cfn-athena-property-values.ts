/*
 * Every read here indexes a template's own property record by a property name
 * this file's callers name as a literal. The names are ours rather than a
 * caller's, so the injection sink the rule is about is not reachable.
 */
// oxlint-disable security/detect-object-injection

import { isRecord } from "../../../util/type-guard/record.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * How a property reports a value of the wrong type.
 *
 * The builder comes from the Resource being read, so a refusal names the
 * logical ID whatever depth the property sits at.
 */
export type SimCfnAthenaPropertyErrorBuilder = (reason: string) => Error;

/**
 * Reads one record of template properties, refusing a value of the wrong type.
 *
 * A numeric or `"true"`/`"false"` string is read as the number or flag it
 * stands for, because a template parameter arrives as a string even where the
 * property it feeds is not one.
 */
export class SimCfnAthenaProperties {
  constructor(
    private readonly values: SimCfnTemplateValueRecord,
    private readonly error: SimCfnAthenaPropertyErrorBuilder,
  ) {}

  /** A nested record of properties, or nothing where the template has none. */
  nested(name: string): SimCfnAthenaProperties | undefined {
    const value = this.values[name];

    if (value === undefined) {
      return undefined;
    }

    if (!isRecord(value)) {
      throw this.error(`${name} must be an object`);
    }

    return new SimCfnAthenaProperties(value, this.error);
  }

  /** A string property. */
  string(name: string): string | undefined {
    const value = this.values[name];

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.error(`${name} must be a string`);
    }

    return value;
  }

  /** A number property. */
  number(name: string): number | undefined {
    const value = this.values[name];

    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "number") {
      return value;
    }

    const parsed = typeof value === "string" ? Number(value.trim()) : NaN;

    if (value === "" || !Number.isFinite(parsed)) {
      throw this.error(`${name} must be a number`);
    }

    return parsed;
  }

  /** A boolean property. */
  boolean(name: string): boolean | undefined {
    const value = this.values[name];

    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (value !== "true" && value !== "false") {
      throw this.error(`${name} must be a boolean`);
    }

    return value === "true";
  }
}
