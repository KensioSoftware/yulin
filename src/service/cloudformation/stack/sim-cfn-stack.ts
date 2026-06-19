import type { SimAws } from "../../aws/sim-aws.js";
import type { Brand } from "../../../util/brand.type.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type {
  CfnTemplateBodyRecord,
  SimCfnTemplate,
} from "../template/sim-cfn-template.js";
import { SimCfnStackResourceDeployer } from "./deploy/sim-cfn-stack-resource-deployer.js";
import { makeSimCfnStackResourceMap } from "./resource-map/sim-cfn-stack-resource-map.js";
import { SimCfnStackDeploymentScheduler } from "./deploy/sim-cfn-stack-deployment-scheduler.js";

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
 * - SimCfnStackResourceDeployer creates resources in dependency order.
 */
export class SimCfnStack {
  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler;
  private readonly cfnTemplate: SimCfnTemplate;
  private _status: SimCloudFormationStackStatus = "REVIEW_IN_PROGRESS";

  private deployCompletePromise: Promise<void> | undefined;
  private deployError: Error | undefined;

  public readonly stackName: SimCloudFormationStackName;
  public readonly template: CfnTemplateBodyRecord;
  public readonly resources: Map<string, SimCfnResource>;

  constructor(props: SimCloudFormationStackProps) {
    const { simAws, accountRegionScope, background, stackName, template } =
      props;

    this.simAws = simAws;
    this.background = background;
    this.stackName = stackName;
    this.cfnTemplate = template;
    this.template = this.cfnTemplate.template;
    this.resources = makeSimCfnStackResourceMap({
      accountRegionScope,
      background,
      template: this.cfnTemplate,
    });
  }

  /**
   * Get the current externally visible Stack status.
   *
   * Command handlers use this value when describing the Stack. Deployment
   * updates it as the scheduled deployment task starts, completes, or fails.
   */
  public get status(): SimCloudFormationStackStatus {
    return this._status;
  }

  /**
   * Get the deployment error captured during background deployment, if any.
   *
   * The Stack keeps this error so callers can inspect failure details through
   * description APIs, and so waitForDeployComplete can rethrow the deployment
   * failure to synchronous test or command code.
   */
  public get error(): Error | undefined {
    return this.deployError;
  }

  /**
   * Start deploying this simulated Stack into simulated AWS.
   *
   * This method performs Stack-level lifecycle orchestration only: it validates
   * the current status, marks deployment as in progress, clears any previous
   * error, and schedules the deployment task. The scheduler controls background
   * timing, while deployResources delegates actual resource creation ordering
   * to SimCfnStackResourceDeployer.
   */
  async deploy(): Promise<void> {
    if (this._status !== "REVIEW_IN_PROGRESS") {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackName} cannot be deployed from ${this._status} status`,
      );
    }

    this._status = "CREATE_IN_PROGRESS";
    this.deployError = undefined;

    const scheduler = new SimCfnStackDeploymentScheduler({
      background: this.background,
      failureMessage: "Sim CloudFormation Stack deploy failed",
    });

    await scheduler.sequence();

    this.deployCompletePromise = scheduler.schedule({
      deploy: async () => {
        // The scheduler controls background timing.
        // deployResources controls the actual resource creation order.
        await this.deployResources();
      },
      onSuccess: () => {
        this._status = "CREATE_COMPLETE";
      },
      onFailure: (error) => {
        this._status = "CREATE_FAILED";
        this.deployError = error;
      },
    });
  }

  /**
   * Wait for the scheduled deployment task to finish.
   *
   * If deployment failed in the background, rethrow the captured deployment
   * error after the scheduled task has completed. If deployment has not been
   * started, this method returns without doing anything.
   */
  async waitForDeployComplete(): Promise<void> {
    if (this.deployCompletePromise !== undefined) {
      await this.deployCompletePromise;
    }

    if (this.deployError !== undefined) {
      throw this.deployError;
    }
  }

  /**
   * Delegate resource dependency ordering and creation to the resource
   * deployer.
   */
  private async deployResources(): Promise<void> {
    const deployer = new SimCfnStackResourceDeployer({
      simAws: this.simAws,
      resources: this.resources,
      stackName: this.stackName,
    });

    await deployer.deploy();
  }
}
