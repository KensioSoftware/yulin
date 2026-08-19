import path from "node:path";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import {
  loadCdkAssemblyStacks,
  type SimCdkAssemblyStack,
} from "../cdk/sim-cdk-assembly-manifest.js";
import { orderCdkAssemblyStacks } from "../cdk/sim-cdk-assembly-order.js";
import { selectCdkAssemblyStacks } from "../cdk/sim-cdk-assembly-selection.js";
import {
  assertCdkOutOptionsAreDeployed,
  type SimCfnCdkOutStackOptionsByName,
} from "./sim-cfn-cdk-out-stack-options.js";

export interface SimCloudFormationDeployCdkOutProperties {
  /** The `cdk.out` directory to deploy, holding a `manifest.json`. */
  readonly directoryPath: string;

  /**
   * The Stacks to deploy, named by Stack name or by CDK artifact ID.
   *
   * Every Stack in the assembly is deployed when this is left out, which is
   * rarely what a test wants of an app that also synthesizes a deployment
   * pipeline.
   *
   * The order they are named is the order they deploy in. A Stack the manifest
   * says another depends on still goes first, whatever order the two are named
   * in.
   */
  readonly stackNames?: readonly string[] | undefined;

  /**
   * Bindings, parameters and a transform for individual Stacks, keyed the same
   * way `stackNames` names them.
   */
  readonly stackOptions?: SimCfnCdkOutStackOptionsByName | undefined;
}

/** A Stack to deploy, in the region it has been resolved into. */
export interface SimCfnCdkOutPlannedStack extends SimCdkAssemblyStack {
  readonly regionName: AwsRegionName;
}

export interface SimCfnCdkOutPlan {
  readonly stacks: readonly SimCfnCdkOutPlannedStack[];
  readonly stackOptions?: SimCfnCdkOutStackOptionsByName | undefined;
}

/**
 * Work out which Stacks to deploy, in what order, and into which region.
 *
 * Everything a deployment decides from the cloud assembly is decided here, so
 * an assembly that cannot be deployed says so before any Stack is created.
 */
export async function planCdkOutDeployment(properties: {
  readonly request: SimCloudFormationDeployCdkOutProperties | string;
  readonly defaultRegionName: AwsRegionName;
}): Promise<SimCfnCdkOutPlan> {
  const { directoryPath, stackNames, stackOptions } = cdkOutDeployment(
    properties.request,
  );

  const selected = selectCdkAssemblyStacks({
    stacks: await loadCdkAssemblyStacks(directoryPath),
    stackNames,
    directoryPath: path.resolve(directoryPath),
  });

  assertCdkOutOptionsAreDeployed(stackOptions, selected);

  return {
    stacks: orderCdkAssemblyStacks(selected).map((stack) => ({
      ...stack,
      regionName: stack.regionName ?? properties.defaultRegionName,
    })),
    stackOptions,
  };
}

/**
 * Normalize a cloud assembly deployment request, which may be the directory
 * path on its own.
 */
function cdkOutDeployment(
  request: SimCloudFormationDeployCdkOutProperties | string,
): SimCloudFormationDeployCdkOutProperties {
  return typeof request === "string" ? { directoryPath: request } : request;
}
