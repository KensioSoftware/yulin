import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimRestApiDeploymentId } from "../../api/deployment/sim-rest-api-deployment.js";
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
}

/**
 * Publishes a deployment of a REST API to a stage.
 *
 * `CreateStage` and `CreateDeployment` both end here, because a deployment
 * given a `stageName` publishes itself in the same call. That is how the SDK
 * and the console publish an API in one step.
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
  publish(restApi: SimRestApi, input: SimRestApiStageInput): SimRestApiStage {
    this.rules.requireUnusedStageName(restApi, input.stageName);

    const stage = new SimRestApiStage({
      ...input,
      createdDate: this.clock.now(),
    });
    restApi.stages.add(stage);

    return stage;
  }
}
