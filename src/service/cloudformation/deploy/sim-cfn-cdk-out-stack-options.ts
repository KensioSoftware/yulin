import type { SimCdkAssemblyStack } from "../cdk/sim-cdk-assembly-manifest.js";
import type { SimCfnDeployBinding } from "../bind/sim-cfn-deploy-binding.js";
import type { SimCfnTemplateFileTransform } from "./sim-cfn-template-file-transform.js";

/**
 * What one Stack in a cloud assembly is deployed with.
 *
 * These are the per-template options `deployTemplateFile` takes, for the one
 * Stack they are keyed against.
 */
export interface SimCfnCdkOutStackOptions {
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;
  readonly transform?: SimCfnTemplateFileTransform | undefined;
}

export type SimCfnCdkOutStackOptionsByName = Record<
  string,
  SimCfnCdkOutStackOptions
>;

/**
 * The options a Stack is deployed with, keyed by Stack name or artifact ID.
 */
export function cdkOutOptionsFor(
  stack: SimCdkAssemblyStack,
  optionsByName: SimCfnCdkOutStackOptionsByName | undefined,
): SimCfnCdkOutStackOptions {
  return (
    optionsByName?.[stack.stackName] ?? optionsByName?.[stack.artifactId] ?? {}
  );
}

/**
 * Refuse options keyed against a Stack that is not being deployed.
 *
 * A renamed Stack would otherwise take its bindings and its transform with it
 * without saying anything, and the deployment that lost them looks like one
 * that never had them.
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
      `Options were given for ${unmatched.join(", ")}, which no Stack being deployed is named. The Stacks being deployed are ${stackNames(deploying)}.`,
    );
  }
}

function stackNames(stacks: readonly SimCdkAssemblyStack[]): string {
  return stacks.map((stack) => stack.stackName).join(", ");
}
