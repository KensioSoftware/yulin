import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfnBinding } from "../../bind/sim-cfn-binding.js";
import type { SimCdkOutContext } from "../../cdk/sim-cdk-out-context.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import {
  simCfnOrderedResources,
  type SimCfnResourceOrder,
} from "./sim-cfn-resource-order.js";

interface SimCfnStackResourceBatchCreatorProperties {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;
  readonly caller?: SimAwsCaller | undefined;
  readonly resourceOrder?: SimCfnResourceOrder | undefined;
}

/**
 * Creates one dependency-ready batch of Stack Resources.
 *
 * The caller guarantees that every supplied Resource is ready to create. This
 * class owns only the batch execution details:
 *
 * - create all Resources in the batch in parallel
 * - start them in the order the deployment asked for
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
  private readonly bindings: readonly SimCfnBinding[] | undefined;
  private readonly caller: SimAwsCaller | undefined;
  private readonly resourceOrder: SimCfnResourceOrder | undefined;

  constructor(properties: SimCfnStackResourceBatchCreatorProperties) {
    const {
      simAws,
      resources,
      cdkOutContext,
      bindings,
      caller,
      resourceOrder,
    } = properties;

    this.simAws = simAws;
    this.resources = resources;
    this.cdkOutContext = cdkOutContext;
    this.bindings = bindings;
    this.caller = caller;
    this.resourceOrder = resourceOrder;
  }

  /**
   * Create the supplied Resources concurrently.
   *
   * Each Resource still owns its own create lifecycle and status transitions.
   * This method only waits for the batch to settle.
   *
   * Nothing in the batch depends on anything else in it, so the order they
   * start in is the deployment's to choose.
   */
  async create(resources: readonly SimCfnResource[]): Promise<void> {
    await Promise.all(
      simCfnOrderedResources(resources, this.resourceOrder).map(
        async (resource) => {
          await resource.create({
            simAws: this.simAws,
            resources: this.resources,
            cdkOutContext: this.cdkOutContext,
            bindings: this.bindings,
            caller: this.caller,
          });
        },
      ),
    );
  }
}
