import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

interface SimCfnStackResourceDeployerProps {
  readonly simAws: SimAws;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly stackName: string;
}

/**
 * Creates simulated CloudFormation Stack resources in dependency order.
 *
 * This class does not schedule deployment work or update Stack status. That is
 * the responsibility of SimCfnStack and SimCfnStackDeploymentScheduler. This
 * deployer only decides which resources can be created, creates each ready
 * batch, and fails if the remaining resource dependencies cannot be resolved.
 */
export class SimCfnStackResourceDeployer {
  private readonly simAws: SimAws;
  private readonly resources: ReadonlyMap<string, SimCfnResource>;
  private readonly stackName: string;

  constructor(props: SimCfnStackResourceDeployerProps) {
    const { simAws, resources, stackName } = props;

    this.simAws = simAws;
    this.resources = resources;
    this.stackName = stackName;
  }

  /**
   * Create all Stack resources whose dependencies become satisfiable.
   *
   * Deployment proceeds in batches. Each loop creates every currently creatable
   * resource in parallel, then checks which resources are still incomplete. If
   * no pending resource can be created, the template contains unresolved or
   * cyclic dependencies and deployment fails.
   */
  async deploy(): Promise<void> {
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
        });
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
