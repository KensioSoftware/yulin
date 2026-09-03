import path from "node:path";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import {
  loadCdkAssemblyStacks,
  type SimCdkAssemblyStack,
} from "../cdk/sim-cdk-assembly-manifest.js";
import { orderCdkAssemblyStacks } from "../cdk/sim-cdk-assembly-order.js";
import { selectCdkAssemblyStacks } from "../cdk/sim-cdk-assembly-selection.js";
import type { SimCfnCdkOutStackOptionsByName } from "./sim-cfn-cdk-out-stack-options.js";
import { assertCdkOutOptionsAreDeployed } from "./sim-cfn-cdk-out-options-deployed.js";
import type { SimCfnResourceOrder } from "../stack/deploy/sim-cfn-resource-order.js";

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
   * The principal every Stack in the assembly is deployed as, which one named
   * in `stackOptions` overrides for its own Stack.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * The principal every Stack in the assembly publishes its CDK file assets
   * as, which one named in `stackOptions` overrides for its own Stack.
   *
   * A real `cdk deploy` publishes assets as the file publishing Role and
   * processes each template as the execution Role. Left out, an assembly
   * publishes its assets as `caller`.
   */
  readonly assetsCaller?: SimAwsCaller | undefined;

  /**
   * The order every Stack in the assembly creates Resources with no dependency
   * between them in, which one named in `stackOptions` overrides for its own
   * Stack. `reversed` deploys each Stack the other way round from the one its
   * template is written in.
   */
  readonly resourceOrder?: SimCfnResourceOrder | undefined;

  /**
   * Bindings, parameters, a caller, a Resource order and a transform for
   * individual Stacks, keyed the same way `stackNames` names them.
   */
  readonly stackOptions?: SimCfnCdkOutStackOptionsByName | undefined;
}

/** A Stack to deploy, in the region it has been resolved into. */
export interface SimCfnCdkOutPlannedStack extends SimCdkAssemblyStack {
  readonly regionName: AwsRegionName;
}

export interface SimCfnCdkOutPlan {
  readonly stacks: readonly SimCfnCdkOutPlannedStack[];
  readonly caller?: SimAwsCaller | undefined;
  readonly assetsCaller?: SimAwsCaller | undefined;
  readonly resourceOrder?: SimCfnResourceOrder | undefined;
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
  const {
    directoryPath,
    stackNames,
    caller,
    assetsCaller,
    resourceOrder,
    stackOptions,
  } = cdkOutDeployment(properties.request);

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
    caller,
    assetsCaller,
    resourceOrder,
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
