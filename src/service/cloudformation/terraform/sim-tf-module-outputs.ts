/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import { isRecord } from "../../../util/type-guard/record.js";
import type {
  TerraformConfigModule,
  TerraformExpression,
  TerraformPlan,
} from "./sim-tf-plan.type.js";

/**
 * What one module output is, in terms of the module that declares it.
 */
export interface TerraformModuleOutput {
  /** The module path the output's references are relative to. */
  readonly modulePath: readonly string[];
  readonly references: readonly string[];
}

/**
 * Every module output a plan declares, keyed by the address that reads it.
 *
 * A resource in one module reaching a resource in another goes through an
 * output. `module.processor.lambda_function_arn` is not an address any resource
 * has, and the plan resolves nothing for it, so following it means reading the
 * output's own expression and continuing from the module that declares it.
 */
export function terraformModuleOutputs(
  plan: TerraformPlan,
): ReadonlyMap<string, TerraformModuleOutput> {
  const outputs = new Map<string, TerraformModuleOutput>();
  const root = plan.configuration?.root_module;

  if (root !== undefined) {
    collect(root, [], outputs);
  }

  return outputs;
}

function collect(
  config: TerraformConfigModule,
  modulePath: readonly string[],
  outputs: Map<string, TerraformModuleOutput>,
): void {
  const calls = Object.entries(config.module_calls ?? {});

  for (const [callName, call] of calls) {
    const child = call.module;

    if (child === undefined) {
      continue;
    }

    const childPath = [...modulePath, callName];
    const address = childPath.map((name) => `module.${name}`).join(".");

    const declaredOutputs = Object.entries(moduleOutputRecords(child));

    for (const [outputName, declared] of declaredOutputs) {
      outputs.set(`${address}.${outputName}`, {
        modulePath: childPath,
        references: declared,
      });
    }

    collect(child, childPath, outputs);
  }
}

function moduleOutputRecords(
  config: TerraformConfigModule,
): Record<string, readonly string[]> {
  const declared = (config as { outputs?: unknown }).outputs;

  if (!isRecord(declared)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(declared).map(([name, output]) => [
      name,
      outputReferences(output),
    ]),
  );
}

function outputReferences(output: unknown): readonly string[] {
  if (!isRecord(output)) {
    return [];
  }

  const expression = (output as { expression?: unknown }).expression;

  if (!isRecord(expression)) {
    return [];
  }

  return (expression as TerraformExpression).references ?? [];
}
