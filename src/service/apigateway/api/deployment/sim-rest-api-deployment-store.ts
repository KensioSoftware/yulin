import type {
  SimRestApiDeployment,
  SimRestApiDeploymentId,
} from "./sim-rest-api-deployment.js";

/**
 * The deployments of one REST API, keyed by id.
 */
export class SimRestApiDeploymentStore {
  private readonly deployments = new Map<
    SimRestApiDeploymentId,
    SimRestApiDeployment
  >();

  /**
   * Add a deployment to this API.
   */
  add(deployment: SimRestApiDeployment): void {
    this.deployments.set(deployment.deploymentId, deployment);
  }

  /**
   * Find a deployment by id.
   */
  find(deploymentId: string): SimRestApiDeployment | undefined {
    return this.deployments.get(deploymentId as SimRestApiDeploymentId);
  }
}
