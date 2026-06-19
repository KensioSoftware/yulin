import type { SimAws } from "../../aws/sim-aws.js";
import type { Brand } from "../../../util/brand.type.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type {
  CfnTemplateBodyRecord,
  SimCfnTemplate,
} from "../template/sim-cfn-template.js";
import { SimCfnStackResourceCreator } from "./deploy/sim-cfn-stack-resource-creator.js";
import { makeSimCfnStackResourceMap } from "./resource-map/sim-cfn-stack-resource-map.js";
import { SimCfnStackDeploymentLifecycle } from "./deploy/sim-cfn-stack-deployment-lifecycle.js";

export type SimCloudFormationStackName = Brand<
  string,
  "SimCloudFormationStackName"
>;

export type SimCloudFormationStackStatus =
  | "REVIEW_IN_PROGRESS"
  | "CREATE_IN_PROGRESS"
  | "CREATE_COMPLETE"
  | "CREATE_FAILED";

interface SimCloudFormationStackProps {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;
  readonly template: SimCfnTemplate;
}

/**
 * Lightweight simulated CloudFormation Stack.
 *
 * This class owns the externally visible Stack lifecycle: identity, template
 * body, resources, deployment status, deployment error, and wait-for-completion
 * behavior. It delegates lower-level deployment mechanics to smaller
 * collaborators:
 *
 * - makeSimCfnStackResourceMap converts the template into runtime resources.
 * - SimCfnStackDeploymentScheduler controls when deployment runs in the
 *   background.
 * - SimCfnStackResourceCreator creates resources in dependency order.
 */
export class SimCfnStack {
  private readonly simAws: SimAws;
  private readonly cfnTemplate: SimCfnTemplate;
  public readonly lifecycle: SimCfnStackDeploymentLifecycle;

  public readonly stackName: SimCloudFormationStackName;
  public readonly template: CfnTemplateBodyRecord;
  public readonly resources: Map<string, SimCfnResource>;

  constructor(props: SimCloudFormationStackProps) {
    const { simAws, accountRegionScope, background, stackName, template } =
      props;

    this.simAws = simAws;
    this.stackName = stackName;
    this.cfnTemplate = template;
    this.template = this.cfnTemplate.template;
    this.resources = makeSimCfnStackResourceMap({
      accountRegionScope,
      background,
      template: this.cfnTemplate,
    });
    this.lifecycle = new SimCfnStackDeploymentLifecycle({
      background,
      stackName,
      runDeployment: async (): Promise<void> => {
        await this.createResources();
      },
    });
  }

  /**
   * Start deploying this simulated Stack into simulated AWS.
   */
  async deploy(): Promise<void> {
    await this.lifecycle.deploy();
  }

  /**
   * Wait for the scheduled deployment task to finish.
   */
  async waitForDeployComplete(): Promise<void> {
    await this.lifecycle.waitForComplete();
  }

  /**
   * Delegate resource dependency ordering and creation to the resource
   * creator.
   */
  private async createResources(): Promise<void> {
    const resourceCreator = new SimCfnStackResourceCreator({
      simAws: this.simAws,
      resources: this.resources,
      stackName: this.stackName,
    });

    await resourceCreator.createAll();
  }
}
