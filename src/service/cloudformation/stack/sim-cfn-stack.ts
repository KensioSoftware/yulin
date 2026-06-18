import type { SimAws } from "../../aws/sim-aws.js";
import type { Brand } from "../../../util/brand.type.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type {
  CfnTemplateBodyRecord,
  SimCfnTemplate,
} from "../template/sim-cfn-template.js";

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
 */
export class SimCfnStack {
  private readonly simAws: SimAws;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly cfnTemplate: SimCfnTemplate;
  private _status: SimCloudFormationStackStatus = "REVIEW_IN_PROGRESS";

  private deployCompletePromise: Promise<void> | undefined;
  private deployError: Error | undefined;

  public readonly stackName: SimCloudFormationStackName;
  public readonly template: CfnTemplateBodyRecord;
  public readonly resources = new Map<string, SimCfnResource>();

  constructor(props: SimCloudFormationStackProps) {
    const { simAws, accountRegionScope, background, stackName, template } =
      props;

    this.simAws = simAws;
    this.accountRegionScope = accountRegionScope;
    this.background = background;
    this.stackName = stackName;
    this.cfnTemplate = template;
    this.template = this.cfnTemplate.template;

    this.recordTemplateResources();
  }

  /**
   * Get the current Stack status.
   */
  public get status(): SimCloudFormationStackStatus {
    return this._status;
  }

  /**
   * Get the deployment error, if Stack deployment failed.
   */
  public get error(): Error | undefined {
    return this.deployError;
  }

  /**
   * Deploy this simulated Stack into simulated AWS.
   */
  async deploy(): Promise<void> {
    if (this._status !== "REVIEW_IN_PROGRESS") {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackName} cannot be deployed from ${this._status} status`,
      );
    }

    this._status = "CREATE_IN_PROGRESS";
    this.deployError = undefined;

    await this.background.sequence();

    this.deployCompletePromise = new Promise<void>((resolve) => {
      this.background.schedule(async () => {
        try {
          await this.deployResources();
          this._status = "CREATE_COMPLETE";
        } catch (error) {
          const stackError =
            error instanceof Error
              ? error
              : new Error(
                  `Sim CloudFormation Stack deploy failed: ${String(error)}`,
                );

          this._status = "CREATE_FAILED";
          this.deployError = stackError;
        } finally {
          resolve();
        }
      });
    });
  }

  /**
   * Wait for the stack to finish deploying.
   */
  async waitForDeployComplete(): Promise<void> {
    if (this.deployCompletePromise !== undefined) {
      await this.deployCompletePromise;
    }

    if (this.deployError !== undefined) {
      throw this.deployError;
    }
  }

  private async deployResources(): Promise<void> {
    let pendingResources = new Set(this.resources.values());

    while (pendingResources.size > 0) {
      const creatableResources = [...pendingResources].filter((resource) => {
        return resource.canCreate(this.resources);
      });

      if (creatableResources.length === 0) {
        throw new Error(
          `Could not resolve simulated CloudFormation Resource dependencies in Stack ${this.stackName}`,
        );
      }

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        creatableResources.map(async (resource) => {
          await resource.create({
            simAws: this.simAws,
            resources: this.resources,
          });
        }),
      );

      pendingResources = new Set(
        [...pendingResources].filter((resource) => {
          return !resource.createComplete;
        }),
      );
    }

    this._status = "CREATE_COMPLETE";
  }

  private recordTemplateResources(): void {
    for (const resourceTemplate of this.cfnTemplate.resourceTemplates()) {
      this.resources.set(
        resourceTemplate.logicalId,
        new SimCfnResource({
          accountRegionScope: this.accountRegionScope,
          background: this.background,
          logicalId: resourceTemplate.logicalId,
          template: resourceTemplate.template,
        }),
      );
    }
  }
}
