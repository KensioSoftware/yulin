import type { SimCdkAssemblyStack } from "../cdk/sim-cdk-assembly-manifest.js";
import type { SimCfnDeployBinding } from "../bind/sim-cfn-deploy-binding.js";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import type { SimCfnTemplateFileTransform } from "./sim-cfn-template-file-transform.js";

/**
 * Adapts one Stack's parsed template, with the Stacks the same call has already
 * deployed to hand.
 *
 * A synthesized template names the real account's resources as literals, and a
 * simulation allocates its own identifiers for them. The deployed Stacks are
 * keyed by Stack name, and a value one of them created is reached through
 * `output(...)` or `getResource(...)`.
 *
 * A transform taking the template alone is this type too, since the deployed
 * Stacks are the second argument.
 */
export type SimCfnCdkOutTemplateTransform = (
  template: CfnTemplateBodyRecord,
  deployed: ReadonlyMap<string, SimCfnStack>,
) => CfnTemplateBodyRecord;

/**
 * What one Stack in a cloud assembly is deployed with.
 *
 * These are the per-template options `deployTemplateFile` takes, for the one
 * Stack they are keyed against. The transform sees more than that one does,
 * because a Stack in an assembly has Stacks in front of it.
 */
export interface SimCfnCdkOutStackOptions {
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;
  readonly transform?: SimCfnCdkOutTemplateTransform | undefined;
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
 * Bind a Stack's transform to the Stacks deployed ahead of it.
 *
 * The deployment is copied on the way in, so a transform holding on to the map
 * keeps the deployment it was handed while the call goes on deploying.
 */
export function cdkOutBoundTransform(
  transform: SimCfnCdkOutTemplateTransform | undefined,
  deployed: ReadonlyMap<string, SimCfnStack>,
): SimCfnTemplateFileTransform | undefined {
  if (transform === undefined) {
    return undefined;
  }

  const deployedSoFar = new Map(deployed);

  return (template) => transform(template, deployedSoFar);
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
