import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimPersonalizeGetPersonalizedRankingHandler } from "./command/runtime/sim-personalize-get-personalized-ranking.js";
import type { SimPersonalizeGetRecommendationsHandler } from "./command/runtime/sim-personalize-get-recommendations.js";
import type * as simRuntimeCommands from "./command/runtime/runtime.command.js";
import type { SimPersonalizeRequestOptions } from "./command/sim-personalize-request-options.js";
import { SimPersonalizeRuntimeSdkCommandRouter } from "./sdk/sim-personalize-runtime-sdk-command-router.js";

export interface SimPersonalizeRuntimeProperties {
  readonly recommendations: SimPersonalizeGetRecommendationsHandler;
  readonly rankings: SimPersonalizeGetPersonalizedRankingHandler;
  readonly background: BackgroundScheduler;
}

/**
 * Simulated Amazon Personalize Runtime. Handles SDK commands from the
 * separate Personalize Runtime client.
 *
 * It is never built alone. The campaigns it answers for are the ones one
 * simulated Personalize holds, and the results are the ones declared against
 * those campaigns, so both come from there rather than being made here.
 *
 * No model is consulted and no interaction history is held. A campaign
 * answers with what a test declared it would answer with, which is the point:
 * a recommendation from a real trained model moves as the model and the data
 * move, and code branching on what came back has nothing stable to test
 * against.
 */
export class SimPersonalizeRuntime {
  private readonly recommendations: SimPersonalizeGetRecommendationsHandler;
  private readonly rankings: SimPersonalizeGetPersonalizedRankingHandler;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimPersonalizeRuntimeSdkCommandRouter(this);

  constructor(properties: SimPersonalizeRuntimeProperties) {
    this.recommendations = properties.recommendations;
    this.rankings = properties.rankings;
    this.background = properties.background;
  }

  /** Handle a GetRecommendations Command from the SDK. */
  async getRecommendations(
    command: simRuntimeCommands.SimGetRecommendationsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simRuntimeCommands.SimGetRecommendationsCommandOutput> {
    await this.background.sequence();
    return this.recommendations.handle(command, options);
  }

  /** Handle a GetPersonalizedRanking Command from the SDK. */
  async getPersonalizedRanking(
    command: simRuntimeCommands.SimGetPersonalizedRankingCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simRuntimeCommands.SimGetPersonalizedRankingCommandOutput> {
    await this.background.sequence();
    return this.rankings.handle(command, options);
  }

  /** The SDK Command router for this simulated Personalize Runtime. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
