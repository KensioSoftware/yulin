import type { SimRestApiDeploymentId } from "../deployment/sim-rest-api-deployment.js";

interface SimRestApiStageProperties {
  readonly stageName: string;
  readonly deploymentId: SimRestApiDeploymentId;
  readonly createdDate: Date;
  readonly variables?: Readonly<Record<string, string>> | undefined;
  readonly description?: string | undefined;
}

/**
 * Minimal structural stage view, as the Create and Get commands return.
 */
export interface SimRestApiStageView {
  stageName: string;
  deploymentId: string;
  createdDate: Date;
  lastUpdatedDate: Date;
  variables?: Record<string, string>;
  description?: string;
}

/**
 * A simulated REST API stage.
 *
 * A REST API stage is always a path segment of the endpoint, so `prod` serves
 * at `/prod/...`. There is no root-served stage here, unlike an HTTP API's
 * `$default`, and a REST API is unreachable until a stage exists.
 */
export class SimRestApiStage {
  public readonly stageName: string;
  public readonly createdDate: Date;
  public readonly variables: Readonly<Record<string, string>>;
  public readonly description?: string | undefined;

  /**
   * The deployment this stage serves, and when it last changed.
   *
   * A `CreateDeployment` naming a stage that already exists points that stage
   * at the new deployment, which is how an API is redeployed. The stage keeps
   * its name, its creation time and everything addressed through it.
   */
  public deploymentId: SimRestApiDeploymentId;
  public lastUpdatedDate: Date;

  constructor(properties: SimRestApiStageProperties) {
    this.stageName = properties.stageName;
    this.deploymentId = properties.deploymentId;
    this.createdDate = properties.createdDate;
    this.lastUpdatedDate = properties.createdDate;
    this.variables = properties.variables ?? {};
    this.description = properties.description;
  }

  /**
   * Point this stage at a newer deployment of the same API.
   */
  redeploy(deploymentId: SimRestApiDeploymentId, at: Date): void {
    this.deploymentId = deploymentId;
    this.lastUpdatedDate = at;
  }

  /**
   * Get the AWS-like view of this stage.
   *
   * The creation time is copied, since a Date is mutable and a caller holding
   * the stored one could change when the stage says it was created.
   */
  view(): SimRestApiStageView {
    const view: SimRestApiStageView = {
      stageName: this.stageName,
      deploymentId: this.deploymentId,
      createdDate: new Date(this.createdDate),
      lastUpdatedDate: new Date(this.lastUpdatedDate),
    };

    if (Object.keys(this.variables).length > 0) {
      view.variables = { ...this.variables };
    }

    if (this.description !== undefined) {
      view.description = this.description;
    }

    return view;
  }
}
