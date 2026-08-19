import type { SimRestApiStage } from "./sim-rest-api-stage.js";

/**
 * The stages of one REST API, keyed by stage name.
 *
 * A stage name is unique within its API on real AWS, since it is the first
 * path segment of the endpoint the stage serves on.
 */
export class SimRestApiStageStore {
  private readonly stages = new Map<string, SimRestApiStage>();

  /**
   * Add a stage to this API.
   */
  add(stage: SimRestApiStage): void {
    this.stages.set(stage.stageName, stage);
  }

  /**
   * Find a stage by name.
   */
  find(stageName: string): SimRestApiStage | undefined {
    return this.stages.get(stageName);
  }

  /**
   * Forget a stage, as DeleteStage does.
   */
  remove(stageName: string): void {
    this.stages.delete(stageName);
  }

  /**
   * Every stage of this API, in the order they were created.
   */
  list(): SimRestApiStage[] {
    return this.stages.values().toArray();
  }
}
