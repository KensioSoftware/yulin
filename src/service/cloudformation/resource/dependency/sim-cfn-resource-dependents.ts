import type { SimCfnResource } from "../sim-cfn-resource.js";

/**
 * The Resources depending on each Resource of a Stack, keyed by logical ID.
 *
 * Creation reads the dependency graph forwards: a Resource waits for the
 * Resources it names. Deletion reads the same graph backwards: a Resource waits
 * for the Resources naming it, so a Bucket policy goes before its Bucket and a
 * Role's policies go before the Role.
 *
 * The graph is the one each Resource already reports, rather than a second one
 * built for deletion. A Resource nothing depends on has no entry.
 */
export function simCfnResourceDependents(
  resources: ReadonlyMap<string, SimCfnResource>,
): ReadonlyMap<string, readonly SimCfnResource[]> {
  const dependents = new Map<string, SimCfnResource[]>();

  for (const resource of resources.values()) {
    for (const dependency of resource.dependencies()) {
      const existing = dependents.get(dependency);

      if (existing === undefined) {
        dependents.set(dependency, [resource]);
      } else {
        existing.push(resource);
      }
    }
  }

  return dependents;
}
