import type { SimHttpApi } from "../../api/sim-http-api.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2Conflict,
} from "../../error/sim-api-gateway-v2.error.js";

/**
 * The rules a stage has to satisfy before an API will hold it.
 */
export class SimHttpApiStageRules {
  /**
   * Refuse a stage that does not deploy itself.
   *
   * A stage without `AutoDeploy` serves whichever Deployment it was given, and
   * nothing here creates Deployments. Such a stage would serve every request
   * on real AWS from a deployment that never happened, which is a 404 there
   * and would be a working API here, so the stage is refused instead.
   */
  requireAutoDeploy(autoDeploy: boolean | undefined): void {
    if (autoDeploy === true) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      "CreateStage requires AutoDeploy: true, because Deployments are not " +
        "simulated and a stage that does not deploy itself would serve " +
        "nothing on real AWS",
    );
  }

  /**
   * Ensure the API does not already have a stage of this name, which real API
   * Gateway answers with a conflict.
   */
  requireUnusedStageName(httpApi: SimHttpApi, stageName: string): void {
    if (httpApi.stages.find(stageName) !== undefined) {
      throw new SimApiGatewayV2Conflict(
        `API ${httpApi.apiId} already has a stage named ${stageName}`,
      );
    }
  }
}
