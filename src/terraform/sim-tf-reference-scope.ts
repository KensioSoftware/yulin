import type { TerraformResource } from "./sim-tf-resource.type.js";
import {
  longestFirst,
  withoutInstanceKeys,
} from "./sim-tf-reference-address.js";

/** One reference to follow, and the module its own references are written in. */
export interface TerraformScopeHop {
  readonly reference: string;
  readonly modulePath: readonly string[];
}

/**
 * What a reference Terraform resolves for itself stands in for.
 *
 * `each.value.uri` and `var.routes` name no address, and a plan resolves
 * neither to a value where the value is not known yet. What a plan does record
 * is where each one was written from. A `for_each` expression says what the
 * collection was built out of, and a module call says what the caller set each
 * variable to, so following one of these is following a reference written
 * somewhere else.
 *
 * The step is a rewrite rather than an evaluation. `each.value.uri` becomes
 * the references of the collection `each` iterates, in the module that
 * declared the resource, and `var.routes` becomes the references of the module
 * call, in the module that made it.
 *
 * What is lost either way is which part of the collection was being read.
 * A plan records the references of a `routes` map as one list, with nothing to
 * say which route or which of its keys each one belongs to, so `each.value.uri`
 * and `each.value.timeout_milliseconds` are written down identically. The
 * caller is what decides that an ambiguous answer is no answer.
 */
export function terraformScopeHops(
  reference: string,
  modulePath: readonly string[],
  from: TerraformResource,
  moduleVariables: ReadonlyMap<string, readonly string[]>,
  depth: number,
): readonly TerraformScopeHop[] {
  if (reference.startsWith("each.")) {
    return eachHops(modulePath, from, depth);
  }

  if (reference.startsWith("var.")) {
    return variableHops(reference, modulePath, moduleVariables);
  }

  return [];
}

/**
 * The collection `each` iterates, read from the resource doing the reading.
 *
 * Only the resource whose own expression held the reference has an `each` to
 * read, which is the reference at depth zero. A reference reached by an
 * earlier hop was written in another module, against another resource's
 * collection, and is left alone.
 */
function eachHops(
  modulePath: readonly string[],
  from: TerraformResource,
  depth: number,
): readonly TerraformScopeHop[] {
  if (depth > 0) {
    return [];
  }

  return longestFirst(from.forEach).map((reference) => ({
    reference,
    modulePath,
  }));
}

/**
 * What the caller set one of a module's variables to.
 *
 * The index is keyed by call path, since a module declares its variables once
 * however many instances of the call there are, and the references the caller
 * wrote are relative to the module holding the call.
 */
function variableHops(
  reference: string,
  modulePath: readonly string[],
  moduleVariables: ReadonlyMap<string, readonly string[]>,
): readonly TerraformScopeHop[] {
  if (modulePath.length === 0) {
    return [];
  }

  const call = modulePath
    .map((name) => `module.${withoutInstanceKeys(name)}`)
    .join(".");
  const name = reference.split(".", 2)[1] ?? "";
  const set = moduleVariables.get(`${call}.var.${name}`) ?? [];
  const caller = modulePath.slice(0, -1);

  return longestFirst(set).map((written) => ({
    reference: written,
    modulePath: caller,
  }));
}
