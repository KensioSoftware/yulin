import type { SimHttpApiAccessLogSettings } from "./access-log/sim-http-api-access-log-settings.js";
import type { SimHttpApiAccessLogSettingsView } from "./access-log/sim-http-api-access-log-settings.type.js";
import type { SimHttpApiRouteSettingsView } from "./settings/sim-http-api-route-settings.type.js";
import type { SimHttpApiStageRouteSettings } from "./settings/sim-http-api-stage-route-settings.js";

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
  readonly routeSettings?: SimHttpApiStageRouteSettings | undefined;
  readonly accessLogSettings?: SimHttpApiAccessLogSettings | undefined;
}

/**
 * Minimal structural stage view, as the Create and Get commands return.
 */
export interface SimHttpApiStageView extends SimHttpApiRouteSettingsView {
  StageName: string;
  AutoDeploy: boolean;
  CreatedDate: Date;
  StageVariables?: Record<string, string>;
  Description?: string;
  AccessLogSettings?: SimHttpApiAccessLogSettingsView;
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

  /**
   * The throttle this stage serves its routes at, or undefined for a stage
   * that was given no route settings and so throttles nothing.
   */
  public readonly routeSettings?: SimHttpApiStageRouteSettings | undefined;

  /**
   * Where this stage writes an access log line per request, or undefined for a
   * stage that was given no access log settings and so logs nothing.
   */
  public readonly accessLogSettings?: SimHttpApiAccessLogSettings | undefined;

  constructor(properties: SimHttpApiStageProperties) {
    this.stageName = properties.stageName;
    this.autoDeploy = properties.autoDeploy;
    this.stageVariables = properties.stageVariables ?? {};
    this.description = properties.description;
    this.createdDate = properties.createdDate;
    this.routeSettings = properties.routeSettings;
    this.accessLogSettings = properties.accessLogSettings;
  }

  /**
   * Whether this stage's throttle serves one more request to a route key now.
   *
   * Asking takes a token. A request that is admitted has already paid for
   * itself, and a refused one has taken nothing.
   */
  admits(routeKey: string): boolean {
    return this.routeSettings?.admits(routeKey) ?? true;
  }

  /**
   * Get the AWS-like view of this stage.
   *
   * The creation time is copied, since a Date is mutable and a caller holding
   * the stored one could change when the stage says it was created.
   */
  view(): SimHttpApiStageView {
    const view: SimHttpApiStageView = {
      StageName: this.stageName,
      AutoDeploy: this.autoDeploy,
      CreatedDate: new Date(this.createdDate),
      ...this.routeSettings?.view(),
    };

    if (Object.keys(this.stageVariables).length > 0) {
      view.StageVariables = { ...this.stageVariables };
    }

    if (this.description !== undefined) {
      view.Description = this.description;
    }

    if (this.accessLogSettings !== undefined) {
      view.AccessLogSettings = this.accessLogSettings.view();
    }

    return view;
  }
}
