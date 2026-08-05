import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

interface SimCfnStackResourceBatchDeleterProperties {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
}

/**
 * Deletes one batch of Stack Resources nothing still depends on.
 *
 * The caller guarantees that every supplied Resource is ready to delete. This
 * class owns only the batch execution details: delete them in parallel, passing
 * each the shared Stack context.
 *
 * It does not choose which Resources are ready, retry incomplete Resources, or
 * update Stack lifecycle state.
 */
export class SimCfnStackResourceBatchDeleter {
  private readonly simAws: SimAws;
  private readonly resources: ReadonlyMap<string, SimCfnResource>;

  constructor(properties: SimCfnStackResourceBatchDeleterProperties) {
    this.simAws = properties.simAws;
    this.resources = properties.resources;
  }

  /**
   * Delete the supplied Resources concurrently.
   *
   * Each Resource still owns its own delete lifecycle and status transitions.
   */
  async delete(resources: readonly SimCfnResource[]): Promise<void> {
    await Promise.all(
      resources.map(async (resource) => {
        await resource.delete({
          simAws: this.simAws,
          resources: this.resources,
        });
      }),
    );
  }
}
