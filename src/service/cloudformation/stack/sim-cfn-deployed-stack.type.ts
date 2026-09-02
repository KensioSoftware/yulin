import type { SimCfnDeployedResource } from "../resource/sim-cfn-deployed-resource.type.js";
import type { SimCfnIgnoredProperty } from "../resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnStackOutput } from "./output/sim-cfn-stack-output.js";
import type { SimCloudFormationStackStatus } from "./sim-cfn-stack.type.js";

/**
 * A Stack a deployment has put into simulated AWS.
 *
 * This is what `deployTemplate`, `deployTemplateFile`, `updateTemplateFile` and
 * `deployCdkOut` answer with. It holds the Stack's Outputs, its Resources, the
 * report of what the deployment skipped, made inert or retained, and the two
 * operations a caller asks for itself, which are deleting and tearing down.
 *
 * Deploying a Stack and applying a changed template to one belong to the
 * simulation. The class implementing this owns both, along with the Resource
 * map and the parsed template, and it stays inside the package.
 */
export interface SimCfnDeployedStack {
  /** What the Stack was deployed as. */
  readonly stackName: string;

  /**
   * The Stack's unique ID, which is the ARN CloudFormation gave it when it was
   * created. A Stack deployed again under the same name gets a new one, and a
   * deleted Stack is described by this rather than by the name it gave back.
   */
  readonly stackId: string;

  /** What CloudFormation last did to the Stack. */
  readonly status: SimCloudFormationStackStatus;

  /** What the operation the status reports failed with, where it failed. */
  readonly error: Error | undefined;

  /** Every resolved Stack Output whole, keyed by Output name. */
  readonly outputs: ReadonlyMap<string, SimCfnStackOutput>;

  /**
   * One Stack Output's resolved value, as the string it is.
   *
   * An Output the template never declared throws, as does one that resolved to
   * something other than a string. Read `outputs` for an Output whose value is
   * a list, or for its description and export name.
   */
  output(outputKey: string): string;

  /**
   * Every Stack Resource, in the order the template declared them.
   *
   * A caller after one Resource asks `getResource` for it by name. This is for
   * the questions a name does not answer, such as how many Resources of a type
   * the Stack declared, and the filtering is the caller's to do.
   */
  readonly resources: readonly SimCfnDeployedResource[];

  /**
   * One Stack Resource, by logical ID or by the CDK construct ID a synthesized
   * logical ID was generated from.
   *
   * A caller that bound a handler by construct ID can ask the Stack what it
   * bound, without holding the hash CDK appended.
   */
  getResource(logicalId: string): SimCfnDeployedResource | undefined;

  /** Properties the deployment created Resources without acting on. */
  readonly ignoredProperties: readonly SimCfnIgnoredProperty[];

  /** Resources skipped because their sim implementation is unavailable. */
  readonly skippedResources: readonly SimCfnDeployedResource[];

  /** Resources deliberately created as nothing, because nothing reads them. */
  readonly inertResources: readonly SimCfnDeployedResource[];

  /** Resources a teardown recorded in place of deleting them. */
  readonly skippedResourceDeletions: readonly SimCfnDeployedResource[];

  /** Resources a teardown left in simulated AWS, as their policy says to. */
  readonly retainedResources: readonly SimCfnDeployedResource[];

  /** Wait for the deployment to reach `CREATE_COMPLETE` or fail. */
  waitForDeployComplete(): Promise<void>;

  /** Wait for an update to reach `UPDATE_COMPLETE` or fail. */
  waitForUpdateComplete(): Promise<void>;

  /** Wait for a delete to reach `DELETE_COMPLETE` or fail. */
  waitForDeleteComplete(): Promise<void>;

  /**
   * Start deleting the Stack and everything it deployed.
   *
   * Returns once the deletion has been asked for. Wait for it with
   * `waitForDeleteComplete()`, or use `teardown()` for both at once.
   */
  delete(): Promise<void>;

  /** Delete the Stack and everything it deployed, and wait for it to finish. */
  teardown(): Promise<void>;
}
