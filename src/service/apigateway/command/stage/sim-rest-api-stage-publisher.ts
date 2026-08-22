import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimRestApiDeploymentId } from "../../api/deployment/sim-rest-api-deployment.js";
import type { SimRestApiMethodSettingsMap } from "../../api/stage/settings/sim-rest-api-method-settings.type.js";
import { SimRestApiStageMethodSettings } from "../../api/stage/settings/sim-rest-api-stage-method-settings.js";
import { SimRestApiStage } from "../../api/stage/sim-rest-api-stage.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import { SimRestApiStageRules } from "./sim-rest-api-stage-rules.js";

interface SimRestApiStagePublisherProperties {
  readonly clock: SimClock;
}

/**
 * What a stage is created from.
 */
export interface SimRestApiStageInput {
  readonly stageName: string;
  readonly deploymentId: SimRestApiDeploymentId;
  readonly description?: string | undefined;
  readonly variables?: Readonly<Record<string, string>> | undefined;
  readonly methodSettings?: SimRestApiMethodSettingsMap | undefined;
}

/**
 * Publishes a deployment of a REST API to a stage.
 *
 * The two callers want different things from a stage name that is already
 * taken, which is why they get a method each. `CreateStage` is creating a
 * stage and refuses a name in use. `CreateDeployment` naming a stage is
 * redeploying, and points the stage that is already there at the new
 * deployment. That second one is the ordinary release workflow, and every
 * `sam deploy` and `cdk deploy` after the first goes through it.
 */
export class SimRestApiStagePublisher {
  private readonly clock: SimClock;
  private readonly rules = new SimRestApiStageRules();

  constructor(properties: SimRestApiStagePublisherProperties) {
    this.clock = properties.clock;
  }

  /**
   * Add a stage to an API, refusing a name it already serves on.
   */
  create(restApi: SimRestApi, input: SimRestApiStageInput): SimRestApiStage {
    this.rules.requireUnusedStageName(restApi, input.stageName);

    return this.added(restApi, input);
  }

  /**
   * Serve a deployment from a stage, creating the stage where the API has no
   * stage of that name and repointing the one it has where it does.
   */
  deployTo(restApi: SimRestApi, input: SimRestApiStageInput): SimRestApiStage {
    const existing = restApi.stages.find(input.stageName);

    if (existing === undefined) {
      return this.added(restApi, input);
    }

    existing.redeploy(input.deploymentId, this.clock.now());

    return existing;
  }

  /**
   * The throttle a new stage serves at, or undefined for a stage that named no
   * method settings.
   *
   * The buckets are a function of the same clock the stage is stamped with.
   */
  private throttle(
    input: SimRestApiStageInput,
  ): SimRestApiStageMethodSettings | undefined {
    if (input.methodSettings === undefined) {
      return undefined;
    }

    return new SimRestApiStageMethodSettings({
      clock: this.clock,
      methodSettings: input.methodSettings,
    });
  }

  private added(
    restApi: SimRestApi,
    input: SimRestApiStageInput,
  ): SimRestApiStage {
    const stage = new SimRestApiStage({
      ...input,
      createdDate: this.clock.now(),
      methodSettings: this.throttle(input),
    });
    restApi.stages.add(stage);

    return stage;
  }
}
