/**
 * The default stage, which is served at the root of the API endpoint rather
 * than under a stage-name path segment. It is the only stage simulated so far.
 */
export const simHttpApiDefaultStageName = "$default";

interface SimHttpApiStageProperties {
  readonly stageName: string;
  readonly autoDeploy: boolean;
  readonly stageVariables?: Readonly<Record<string, string>> | undefined;
  readonly description?: string | undefined;
  readonly createdDate: Date;
}

/**
 * Minimal structural stage view, as the Create and Get commands return.
 */
export interface SimHttpApiStageView {
  StageName: string;
  AutoDeploy: boolean;
  CreatedDate: Date;
  StageVariables?: Record<string, string>;
  Description?: string;
}

/**
 * A simulated HTTP API stage.
 *
 * A stage is a deployment of the API's routes. Only `$default` is simulated,
 * and it is always deployed: there are no Deployment resources here, so
 * everything an API has is live as soon as it exists.
 */
export class SimHttpApiStage {
  public readonly stageName: string;
  public readonly autoDeploy: boolean;
  public readonly stageVariables: Readonly<Record<string, string>>;
  public readonly description?: string | undefined;
  public readonly createdDate: Date;

  constructor(properties: SimHttpApiStageProperties) {
    this.stageName = properties.stageName;
    this.autoDeploy = properties.autoDeploy;
    this.stageVariables = properties.stageVariables ?? {};
    this.description = properties.description;
    this.createdDate = properties.createdDate;
  }

  /**
   * Get the AWS-like view of this stage.
   */
  view(): SimHttpApiStageView {
    const view: SimHttpApiStageView = {
      StageName: this.stageName,
      AutoDeploy: this.autoDeploy,
      CreatedDate: this.createdDate,
    };

    if (Object.keys(this.stageVariables).length > 0) {
      view.StageVariables = { ...this.stageVariables };
    }

    if (this.description !== undefined) {
      view.Description = this.description;
    }

    return view;
  }
}
