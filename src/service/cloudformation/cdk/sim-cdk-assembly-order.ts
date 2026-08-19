import type { SimCdkAssemblyStack } from "./sim-cdk-assembly-manifest.js";

/**
 * Put Stack artifacts into an order their dependencies allow.
 *
 * A Stack comes after every Stack it depends on. Artifacts outside the given
 * set are left where they are, so a selected subset is ordered among itself
 * and an assets artifact orders nothing.
 *
 * Stacks that depend on nothing keep the order the manifest holds them in.
 */
export function orderCdkAssemblyStacks(
  stacks: readonly SimCdkAssemblyStack[],
): readonly SimCdkAssemblyStack[] {
  const ordering = new SimCdkAssemblyStackOrdering(stacks);

  for (const stack of stacks) {
    ordering.place(stack, []);
  }

  return ordering.ordered;
}

class SimCdkAssemblyStackOrdering {
  public readonly ordered: SimCdkAssemblyStack[] = [];

  private readonly byArtifactId: Map<string, SimCdkAssemblyStack>;
  private readonly placed = new Set<string>();
  private readonly placing = new Set<string>();

  constructor(stacks: readonly SimCdkAssemblyStack[]) {
    this.byArtifactId = new Map(
      stacks.map((stack) => [stack.artifactId, stack]),
    );
  }

  place(stack: SimCdkAssemblyStack, trail: readonly string[]): void {
    if (this.placed.has(stack.artifactId)) {
      return;
    }

    this.assertNoCycle(stack, trail);
    this.placing.add(stack.artifactId);

    for (const dependency of this.dependenciesOf(stack)) {
      this.place(dependency, [...trail, stack.artifactId]);
    }

    this.placing.delete(stack.artifactId);
    this.placed.add(stack.artifactId);
    this.ordered.push(stack);
  }

  private dependenciesOf(
    stack: SimCdkAssemblyStack,
  ): readonly SimCdkAssemblyStack[] {
    return stack.dependencyArtifactIds
      .map((artifactId) => this.byArtifactId.get(artifactId))
      .filter(
        (dependency): dependency is SimCdkAssemblyStack =>
          dependency !== undefined,
      );
  }

  private assertNoCycle(
    stack: SimCdkAssemblyStack,
    trail: readonly string[],
  ): void {
    if (!this.placing.has(stack.artifactId)) {
      return;
    }

    const cycle = [
      ...trail.slice(trail.indexOf(stack.artifactId)),
      stack.artifactId,
    ];

    throw new Error(
      `The CDK cloud assembly holds Stacks that depend on each other in a cycle, so there is no order to deploy them in: ${cycle.join(" -> ")}.`,
    );
  }
}
