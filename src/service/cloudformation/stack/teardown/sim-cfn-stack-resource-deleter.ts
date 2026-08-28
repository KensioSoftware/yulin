import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { SimCfnStackPendingDeletions } from "./sim-cfn-stack-pending-deletions.js";
import { SimCfnStackResourceBatchDeleter } from "./sim-cfn-stack-resource-batch-deleter.js";

interface SimCfnStackResourceDeleterProperties {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly stackName: string;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Orchestrates reverse-dependency-ordered deletion of a Stack's Resources.
 *
 * The mirror image of SimCfnStackResourceCreator:
 *
 * - ask SimCfnStackPendingDeletions which pending Resources nothing depends on
 * - fail if no pending Resource can make progress
 * - ask SimCfnStackResourceBatchDeleter to delete the ready batch
 * - repeat with the Resources that are still not delete-complete
 *
 * Deleting in this order is what makes the individual service deleters
 * workable: a Bucket policy is gone before its Bucket, a Role's policies before
 * the Role, and every Ref a Resource carries still resolves while that Resource
 * is being deleted.
 */
export class SimCfnStackResourceDeleter {
  private readonly resources: ReadonlyMap<string, SimCfnResource>;
  private readonly stackName: string;
  private readonly batchDeleter: SimCfnStackResourceBatchDeleter;

  constructor(properties: SimCfnStackResourceDeleterProperties) {
    const { simAws, resources, stackName, caller } = properties;

    this.resources = resources;
    this.stackName = stackName;
    this.batchDeleter = new SimCfnStackResourceBatchDeleter({
      simAws,
      resources,
      caller,
    });
  }

  /**
   * Delete every Stack Resource once nothing depends on it any more.
   *
   * What a teardown does, where an update deletes only the Resources its
   * template dropped or replaced.
   */
  async deleteAll(): Promise<void> {
    await this.delete(this.resources.values().toArray());
  }

  /**
   * Delete the given Stack Resources once nothing depends on them any more.
   *
   * The loop is sequential between batches because a Resource can only go once
   * the Resources naming it have gone. Deletion inside a batch is parallel and
   * delegated to SimCfnStackResourceBatchDeleter.
   *
   * Dependents are read across every Resource in the Stack rather than only the
   * ones being deleted, so a Resource an update leaves alone still holds up the
   * Resource it names.
   *
   * If a loop iteration finds pending Resources but none are deletable, the
   * template's dependencies are cyclic, the same condition creation reports.
   */
  async delete(deleting: readonly SimCfnResource[]): Promise<void> {
    let pendingDeletions = new SimCfnStackPendingDeletions(
      this.resources,
      new Set(deleting),
    );

    while (pendingDeletions.hasResources) {
      const deletableResources = pendingDeletions.deletableResources();

      if (deletableResources.length === 0) {
        throw new Error(
          `Could not resolve simulated CloudFormation Resource dependencies to delete Stack ${this.stackName}`,
        );
      }

      // oxlint-disable-next-line no-await-in-loop
      await this.batchDeleter.delete(deletableResources);

      pendingDeletions = pendingDeletions.incompleteResources();
    }
  }
}
