import type {
  TerraformConfigModule,
  TerraformPlan,
} from "./sim-tf-plan.type.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import type { TerraformResourceAddresses } from "./sim-tf-reference-addresses.js";
import {
  longestFirst,
  moduleOutputPath,
  qualifiedReference,
  withoutInstanceKeys,
} from "./sim-tf-reference-address.js";

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
): ReadonlyMap<string, readonly string[]> {
  const outputs = new Map<string, readonly string[]>();
  const root = plan.configuration?.root_module;

  if (root !== undefined) {
    collect(root, [], outputs);
  }

  return outputs;
}

function collect(
  config: TerraformConfigModule,
  modulePath: readonly string[],
  outputs: Map<string, readonly string[]>,
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
      outputs.set(`${address}.${name}`, output.expression?.references ?? []);
    }

    collect(child, childPath, outputs);
  }
}

/** How far a chain of outputs is followed before it is taken to be a loop. */
const outputLimit = 8;

/**
 * Following a reference that names a module output.
 *
 * `module.processor.lambda_function_arn` is an address no resource has. The
 * output's own expression names what it reads, in terms of the module
 * declaring it, so following one is resolving that expression again a module
 * down.
 */
export class TerraformModuleOutputWalk {
  constructor(
    private readonly outputs: ReadonlyMap<string, readonly string[]>,
    private readonly resources: TerraformResourceAddresses,
  ) {}

  /**
   * The resource a module output leads to.
   *
   * An output built out of several resources answers with the first that
   * resolves, and the depth limit stops a module whose outputs refer to each
   * other from looping.
   */
  public target(qualified: string, depth = 0): TerraformResource | undefined {
    const output = this.references(qualified);

    if (output === undefined || depth >= outputLimit) {
      return undefined;
    }

    // The path the output was read through rather than the one it was
    // declared under, so an output reached inside a `for_each` instance
    // follows its own instance's resources.
    const instance = moduleOutputPath(qualified);

    for (const reference of longestFirst(output)) {
      const nested = qualifiedReference(reference, instance);
      const target =
        this.resources.longestMatch(nested) ?? this.target(nested, depth + 1);

      if (target !== undefined) {
        return target;
      }
    }

    return undefined;
  }

  /**
   * The attribute a reference through an output reads.
   *
   * The reference names the output, and the output's own expression is what
   * says which attribute of the resource behind it was being read.
   */
  public attributeOf(qualified: string): string | undefined {
    const [longest] = longestFirst(this.references(qualified) ?? []);

    return longest?.split(".").pop();
  }

  /**
   * The references one output declares.
   *
   * The index is keyed by module call path, since a module declares its
   * outputs once however many instances of the call there are. A reference
   * made from inside one instance carries that instance's key, so the key
   * comes off when the qualified form finds nothing.
   */
  private references(qualified: string): readonly string[] | undefined {
    return (
      this.outputs.get(qualified) ??
      this.outputs.get(withoutInstanceKeys(qualified))
    );
  }
}
