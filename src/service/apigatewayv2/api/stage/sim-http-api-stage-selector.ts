import type { SimHttpApiStageStore } from "./sim-http-api-stage-store.js";
import {
  simHttpApiDefaultStageName,
  type SimHttpApiStage,
} from "./sim-http-api-stage.js";

interface SimHttpApiStageSelectionProperties {
  readonly stage: SimHttpApiStage;
  readonly segments: readonly string[];
}

/**
 * The stage serving a request, and the path segments left for the routes.
 */
export class SimHttpApiStageSelection {
  public readonly stage: SimHttpApiStage;
  public readonly segments: readonly string[];

  constructor(properties: SimHttpApiStageSelectionProperties) {
    this.stage = properties.stage;
    this.segments = properties.segments;
  }
}

/**
 * Picks the stage serving one request.
 *
 * A named stage is served under its own name, so the first path segment of
 * `/dev/pets/6` names the stage and the routes never see it. The `$default`
 * stage is served at the root instead, and keeps the whole path.
 *
 * This runs before route selection, and a named stage wins outright: an API
 * with a stage named `pets` serves `/pets/dog` from that stage, whatever its
 * routes would have made of the path.
 */
export class SimHttpApiStageSelector {
  /**
   * Find the stage serving this request, if the API has one for it.
   */
  select(
    stages: SimHttpApiStageStore,
    segments: readonly string[],
  ): SimHttpApiStageSelection | undefined {
    const named = this.namedStage(stages, segments);

    if (named !== undefined) {
      return named;
    }

    const fallback = stages.find(simHttpApiDefaultStageName);

    if (fallback === undefined) {
      return undefined;
    }

    return new SimHttpApiStageSelection({ stage: fallback, segments });
  }

  private namedStage(
    stages: SimHttpApiStageStore,
    segments: readonly string[],
  ): SimHttpApiStageSelection | undefined {
    const [first, ...rest] = segments;

    // A `$default` stage is not addressable by name, so a request path saying
    // so is a path, not a stage.
    if (first === undefined || first === simHttpApiDefaultStageName) {
      return undefined;
    }

    const stage = stages.find(first);

    if (stage === undefined) {
      return undefined;
    }

    return new SimHttpApiStageSelection({ stage, segments: rest });
  }
}
