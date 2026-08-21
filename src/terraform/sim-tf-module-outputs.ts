import type {
  TerraformConfigModule,
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

    const declared = Object.entries(child.outputs ?? {});

    for (const [name, output] of declared) {
      outputs.set(`${address}.${name}`, {
        modulePath: childPath,
        references: output.expression?.references ?? [],
      });
    }

    collect(child, childPath, outputs);
  }
}
