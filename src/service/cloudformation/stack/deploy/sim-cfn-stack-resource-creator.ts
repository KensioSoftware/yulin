import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCdkOutContext } from "../../cdk/sim-cdk-out-context.js";

interface SimCfnStackResourceCreatorProps {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly stackName: string;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly skippedResources?: SimCfnResource[] | undefined;
}

/**
 * Creates simulated CloudFormation Stack resources in dependency order.
 *
 * This class owns only the resource creation algorithm:
 *
 * - identify resources whose dependencies are already satisfied
 * - create each currently-ready batch in parallel
 * - repeat until every resource reports creation complete
 * - fail when no remaining resource can be created
 *
 * It does not start Stack deployment, schedule background work, update Stack
 * status, or capture deployment errors. Those lifecycle concerns belong to
 * SimCfnStackDeploymentLifecycle and SimCfnStackDeploymentScheduler.
 */
export class SimCfnStackResourceCreator {
  private readonly simAws: SimAws;
  private readonly resources: ReadonlyMap<string, SimCfnResource>;
  private readonly stackName: string;
  private readonly cdkOutContext: SimCdkOutContext | undefined;
  private readonly skippedResources: SimCfnResource[];

  constructor(props: SimCfnStackResourceCreatorProps) {
    const {
      simAws,
      resources,
      stackName,
      cdkOutContext,
      skippedResources = [],
    } = props;

    this.simAws = simAws;
    this.resources = resources;
    this.stackName = stackName;
    this.cdkOutContext = cdkOutContext;
    this.skippedResources = skippedResources;
  }

  /**
   * Create every Stack resource once its dependencies become satisfiable.
   *
   * Resources are created in dependency-respecting batches rather than one at a
   * time. After each batch completes, the creator recalculates which resources
   * are still incomplete. If none of the pending resources can be created, the
   * template contains unresolved or cyclic dependencies.
   */
  async createAll(): Promise<void> {
    let pendingResources = new Set(this.resources.values());

    while (pendingResources.size > 0) {
      const creatableResources = this.creatableResources(pendingResources);

      if (creatableResources.length === 0) {
        throw new Error(
          `Could not resolve simulated CloudFormation Resource dependencies in Stack ${this.stackName}`,
        );
      }

      // eslint-disable-next-line no-await-in-loop
      await this.createResources(creatableResources);

      pendingResources = this.incompleteResources(pendingResources);
    }
  }

  private creatableResources(
    pendingResources: ReadonlySet<SimCfnResource>,
  ): SimCfnResource[] {
    return [...pendingResources].filter((resource) => {
      return resource.canCreate(this.resources);
    });
  }

  private async createResources(
    resources: readonly SimCfnResource[],
  ): Promise<void> {
    await Promise.all(
      resources.map(async (resource) => {
        await resource.create({
          simAws: this.simAws,
          resources: this.resources,
          cdkOutContext: this.cdkOutContext,
        });

        if (resource.skipped) {
          this.skippedResources.push(resource);
        }
      }),
    );
  }

  private incompleteResources(
    pendingResources: ReadonlySet<SimCfnResource>,
  ): Set<SimCfnResource> {
    return new Set(
      [...pendingResources].filter((resource) => {
        return !resource.createComplete;
      }),
    );
  }
}
