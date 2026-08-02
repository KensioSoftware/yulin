import type { SimHttpApiStage } from "./sim-http-api-stage.js";

/**
 * The stages of one API, keyed by stage name, which is what names a stage on
 * real AWS.
 */
export class SimHttpApiStageStore {
  private readonly stages = new Map<string, SimHttpApiStage>();

  /**
   * Add a stage to this API.
   */
  add(stage: SimHttpApiStage): void {
    this.stages.set(stage.stageName, stage);
  }

  /**
   * Find a stage by name.
   */
  find(stageName: string): SimHttpApiStage | undefined {
    return this.stages.get(stageName);
  }

  /**
   * List every stage of this API, in the order they were created.
   */
  list(): SimHttpApiStage[] {
    return this.stages.values().toArray();
  }
}
