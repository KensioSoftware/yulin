import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployBinding } from "../../bind/sim-cfn-deploy-binding.js";
import type { SimCdkOutContext } from "../../cdk/sim-cdk-out-context.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

interface SimCfnStackResourceBatchCreatorProperties {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;
}

/**
 * Creates one dependency-ready batch of Stack Resources.
 *
 * The caller guarantees that every supplied Resource is ready to create. This
 * class owns only the batch execution details:
 *
 * - create all Resources in the batch in parallel
 * - pass the shared Stack creation context to each Resource
 *
 * It does not choose which Resources are ready, retry incomplete Resources, or
 * update Stack deployment lifecycle state. SimCfnStackResourceCreator owns the
 * dependency-ordering loop; SimCfnStackDeploymentLifecycle owns Stack status
 * and completion/error reporting.
 */
export class SimCfnStackResourceBatchCreator {
  private readonly simAws: SimAws;
  private readonly resources: ReadonlyMap<string, SimCfnResource>;
  private readonly cdkOutContext: SimCdkOutContext | undefined;
  private readonly bindings: readonly SimCfnDeployBinding[] | undefined;

  constructor(properties: SimCfnStackResourceBatchCreatorProperties) {
    const { simAws, resources, cdkOutContext, bindings } = properties;

    this.simAws = simAws;
    this.resources = resources;
    this.cdkOutContext = cdkOutContext;
    this.bindings = bindings;
  }

  /**
   * Create the supplied Resources concurrently.
   *
   * Each Resource still owns its own create lifecycle and status transitions.
   * This method only waits for the batch to settle.
   */
  async create(resources: readonly SimCfnResource[]): Promise<void> {
    await Promise.all(
      resources.map(async (resource) => {
        await resource.create({
          simAws: this.simAws,
          resources: this.resources,
          cdkOutContext: this.cdkOutContext,
          bindings: this.bindings,
        });
      }),
    );
  }
}
