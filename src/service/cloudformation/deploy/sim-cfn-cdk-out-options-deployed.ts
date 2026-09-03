import type { SimCdkAssemblyStack } from "../cdk/sim-cdk-assembly-manifest.js";
import type { SimCfnCdkOutStackOptionsByName } from "./sim-cfn-cdk-out-stack-options.js";

/**
 * Refuse options keyed against a Stack that is not being deployed.
 *
 * A renamed Stack would otherwise take its bindings, its caller and its
 * transform with it without saying anything, and the deployment that lost them
 * looks like one that never had them.
 */
export function assertCdkOutOptionsAreDeployed(
  optionsByName: SimCfnCdkOutStackOptionsByName | undefined,
  deploying: readonly SimCdkAssemblyStack[],
): void {
  const names = new Set(
    deploying.flatMap((stack) => [stack.stackName, stack.artifactId]),
  );
  const unmatched = Object.keys(optionsByName ?? {}).filter(
    (name) => !names.has(name),
  );

  if (unmatched.length > 0) {
    throw new Error(
      `Options were given for ${unmatched.join(", ")}, which no Stack being deployed is named. The Stacks being deployed are ${deploying.map((stack) => stack.stackName).join(", ")}.`,
    );
  }
}
