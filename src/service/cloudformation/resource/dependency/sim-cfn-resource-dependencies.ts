/**
 * Return CloudFormation Resource logical IDs from a DependsOn template value.
 */
export function parseSimCfnResourceDependencies(dependsOn: unknown): string[] {
  if (typeof dependsOn === "string") {
    return [dependsOn];
  }

  if (Array.isArray(dependsOn)) {
    return dependsOn.filter((dependency): dependency is string => {
      return typeof dependency === "string";
    });
  }

  return [];
}
