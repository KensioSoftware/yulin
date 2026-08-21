/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  block,
  field,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";

/** What a function's environment came to, and what it cost to get there. */
export interface TerraformLambdaEnvironment {
  /** The CloudFormation property, or nothing to leave the property out. */
  readonly property: SimCfnTemplateValue | undefined;
  /** `environment.variables`, where the plan lost it and nothing filled it. */
  readonly lost: readonly string[];
}

/**
 * The environment variables a simulated function runs with.
 *
 * A map holding one reference to a resource of the same plan is unknown in its
 * entirety, and the variable names go with it, so a deployment can supply the
 * map against the function name the plan carries. What the plan resolved wins
 * over what was supplied, variable by variable, which is what makes a
 * configuration that later resolves the map stop needing the override.
 */
export function lambdaEnvironment(
  context: TerraformMappingContext,
): TerraformLambdaEnvironment {
  const supplied = context.overrides.environment(
    field(context.resource.values, "function_name"),
  );
  const variables = { ...supplied, ...plannedVariables(context) };

  if (Object.keys(variables).length > 0) {
    return { property: { Variables: variables }, lost: [] };
  }

  return {
    property: undefined,
    lost: collapsed(context) ? ["environment.variables"] : [],
  };
}

/** The variables the plan itself resolved, which is usually none of them. */
function plannedVariables(
  context: TerraformMappingContext,
): Readonly<Record<string, string>> {
  const environment = block(context, "environment");
  const variables = environment && field(environment, "variables");

  return isRecord(variables) ? (variables as Record<string, string>) : {};
}

/**
 * Whether Terraform marked the whole variables map unknown.
 *
 * A function declaring no environment at all has lost nothing. One whose map
 * collapsed has lost names this cannot know, which is the case an override is
 * for.
 *
 * The map goes whole or not at all. Terraform 1.15.8 against AWS provider
 * 5.100.0 writes `"variables": true` for a map holding one literal and one
 * reference to a resource of the same plan, so there is no per-variable form
 * of this to read.
 */
function collapsed(context: TerraformMappingContext): boolean {
  const declared = field(context.resource.unknown, "environment");
  const entries: readonly unknown[] = Array.isArray(declared) ? declared : [];

  return isRecord(entries[0]) && field(entries[0], "variables") === true;
}
