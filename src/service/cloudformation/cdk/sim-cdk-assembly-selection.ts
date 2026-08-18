import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCdkAssemblyStack } from "./sim-cdk-assembly-manifest.js";

/**
 * Pick the named Stack artifacts out of a CDK cloud assembly.
 *
 * A name matches the Stack name or the artifact ID, since a CDK app under a
 * Stage deploys a Stack whose artifact ID is not what the Stack is called.
 * Naming nothing takes every Stack in the assembly.
 *
 * Throws naming the Stacks the assembly does hold, which is what a caller who
 * has just renamed one needs to see.
 */
export function selectCdkAssemblyStacks(properties: {
  readonly stacks: readonly SimCdkAssemblyStack[];
  readonly stackNames?: readonly string[] | undefined;
  readonly directoryPath: string;
}): readonly SimCdkAssemblyStack[] {
  const { stacks, stackNames, directoryPath } = properties;

  if (stackNames === undefined) {
    return stacks;
  }

  const selected = new Set(
    stackNames.map((stackName) =>
      selectOne({ stacks, stackName, directoryPath }),
    ),
  );

  return stacks.filter((stack) => selected.has(stack));
}

function selectOne(properties: {
  readonly stacks: readonly SimCdkAssemblyStack[];
  readonly stackName: string;
  readonly directoryPath: string;
}): SimCdkAssemblyStack {
  const { stacks, stackName, directoryPath } = properties;

  const selected = stacks.find(
    (stack) => stack.stackName === stackName || stack.artifactId === stackName,
  );

  assertDefined(
    selected,
    `The CDK cloud assembly at ${directoryPath} holds no Stack named ${stackName}. ` +
      `It holds ${stackNameList(stacks)}.`,
  );

  return selected;
}

function stackNameList(stacks: readonly SimCdkAssemblyStack[]): string {
  if (stacks.length === 0) {
    return "no Stacks at all";
  }

  return stacks.map((stack) => stack.stackName).join(", ");
}
