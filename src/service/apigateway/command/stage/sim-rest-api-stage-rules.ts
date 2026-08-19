import type { SimRestApiDeploymentId } from "../../api/deployment/sim-rest-api-deployment.js";
import type { SimRestApiStage } from "../../api/stage/sim-rest-api-stage.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import {
  SimApiGatewayConflict,
  SimApiGatewayNotFound,
} from "../../error/sim-api-gateway.error.js";

/**
 * The rules about the stages and deployments of one REST API.
 */
export class SimRestApiStageRules {
  /**
   * Get a stage by name, refusing one the API does not serve.
   */
  requireStage(restApi: SimRestApi, stageName: string): SimRestApiStage {
    const stage = restApi.stages.find(stageName);

    if (stage === undefined) {
      throw new SimApiGatewayNotFound(
        `Invalid stage identifier specified: ${stageName}`,
      );
    }

    return stage;
  }

  /**
   * Ensure a deployment a stage names is one the API has.
   */
  requireDeployment(
    restApi: SimRestApi,
    deploymentId: string,
  ): SimRestApiDeploymentId {
    if (restApi.deployments.find(deploymentId) === undefined) {
      throw new SimApiGatewayNotFound(
        `Invalid deployment identifier specified: ${deploymentId}`,
      );
    }

    return deploymentId as SimRestApiDeploymentId;
  }

  /**
   * Ensure a stage name is free. A stage name is the first path segment the
   * stage serves on, so one API serves each name once.
   */
  requireUnusedStageName(restApi: SimRestApi, stageName: string): void {
    if (restApi.stages.find(stageName) === undefined) {
      return;
    }

    throw new SimApiGatewayConflict(`Stage already exists: ${stageName}`);
  }

  /**
   * The stages of one deployment, or every stage where no deployment was
   * named, which is what `GetStages` filters on.
   */
  stagesOfDeployment(
    restApi: SimRestApi,
    deploymentId: string | undefined,
  ): SimRestApiStage[] {
    const stages = restApi.stages.list();

    if (deploymentId === undefined) {
      return stages;
    }

    return stages.filter((stage) => stage.deploymentId === deploymentId);
  }
}
