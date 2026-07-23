import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCdkOutContext } from "../../cdk/sim-cdk-out-context.js";
import type { SimCfnExecutableResourceBinding } from "../../bind/sim-cfn-exec-binding.type.js";
import { SimCfnStackResourceBatchCreator } from "./sim-cfn-stack-resource-batch-creator.js";
import { SimCfnStackPendingResources } from "./sim-cfn-stack-pending-resources.js";

interface SimCfnStackResourceCreatorProperties {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly stackName: string;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
  readonly skippedResources?: SimCfnResource[] | undefined;
}

/**
 * Orchestrates dependency-ordered creation of a Stack's simulated Resources.
 *
 * This class owns the high-level creation loop:
 *
 * - ask SimCfnStackPendingResources which pending Resources are creatable now
 * - fail if no pending Resource can make progress
 * - ask SimCfnStackResourceBatchCreator to create the ready batch
 * - repeat with the Resources that are still not create-complete
 *
 * It does not decide whether an individual Resource's dependencies are
 * satisfied, create Resource batches, schedule background deployment work, or
 * update Stack lifecycle state. Those responsibilities belong to
 * SimCfnResource, SimCfnStackResourceBatchCreator, and
 * SimCfnStackDeploymentLifecycle/Scheduler respectively.
 */
export class SimCfnStackResourceCreator {
  private readonly resources: ReadonlyMap<string, SimCfnResource>;
  private readonly stackName: string;
  private readonly batchCreator: SimCfnStackResourceBatchCreator;

  constructor(properties: SimCfnStackResourceCreatorProperties) {
    const {
      simAws,
      resources,
      stackName,
      cdkOutContext,
      bindings,
      skippedResources = [],
    } = properties;

    this.resources = resources;
    this.stackName = stackName;
    this.batchCreator = new SimCfnStackResourceBatchCreator({
      simAws,
      resources,
      cdkOutContext,
      bindings,
      skippedResources,
    });
  }

  /**
   * Create every Stack Resource once its dependencies become satisfiable.
   *
   * The loop is sequential between batches because each completed batch may
   * satisfy dependencies for later Resources. Creation inside a batch is
   * parallel and delegated to SimCfnStackResourceBatchCreator.
   *
   * If a loop iteration finds pending Resources but none are creatable, the
   * template has unresolved, failed, or cyclic dependencies.
   */
  async createAll(): Promise<void> {
    let pendingResources = new SimCfnStackPendingResources(this.resources);

    while (pendingResources.hasResources) {
      const creatableResources = pendingResources.creatableResources();

      if (creatableResources.length === 0) {
        throw new Error(
          `Could not resolve simulated CloudFormation Resource dependencies in Stack ${this.stackName}`,
        );
      }

      // eslint-disable-next-line no-await-in-loop
      await this.batchCreator.create(creatableResources);

      pendingResources = pendingResources.incompleteResources();
    }
  }
}
