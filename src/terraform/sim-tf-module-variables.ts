import type {
  TerraformConfigModule,
  TerraformPlan,
} from "./sim-tf-plan.type.js";
import { terraformExpressionReferences } from "./sim-tf-expression-references.js";

/**
 * Every variable a module call sets, keyed by the address that names it.
 *
 * A resource inside a module reads its module's own variables, and the value
 * behind one was written by the caller. `var.routes` is not an address any
 * resource has and the plan resolves nothing for it, so following it means
 * reading the call's own expression and continuing from the module that made
 * the call.
 *
 * This is the mirror of `terraformModuleOutputs`. An output carries a value up
 * out of a module and a variable carries one down into it, and the two are the
 * only ways a plan lets a reference cross a module boundary.
 */
export function terraformModuleVariables(
  plan: TerraformPlan,
): ReadonlyMap<string, readonly string[]> {
  const variables = new Map<string, readonly string[]>();
  const root = plan.configuration?.root_module;

  if (root !== undefined) {
    collect(root, [], variables);
  }

  return variables;
}

function collect(
  config: TerraformConfigModule,
  modulePath: readonly string[],
  variables: Map<string, readonly string[]>,
): void {
  const calls = Object.entries(config.module_calls ?? {});

  for (const [callName, call] of calls) {
    const childPath = [...modulePath, callName];
    const address = childPath.map((name) => `module.${name}`).join(".");

    const set = Object.entries(call.expressions ?? {});

    for (const [name, expression] of set) {
      variables.set(
        `${address}.var.${name}`,
        terraformExpressionReferences(expression),
      );
    }

    if (call.module !== undefined) {
      collect(call.module, childPath, variables);
    }
  }
}
