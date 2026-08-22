import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimGetPersonalizedRankingCommand,
  SimGetRecommendationsCommand,
} from "../command/runtime/runtime.command.js";
import type { SimPersonalizeRuntime } from "../sim-personalize-runtime.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Personalize
 * Runtime.
 *
 * The runtime commands have a router of their own because they arrive on a
 * client of their own. An intercepted `PersonalizeRuntimeClient` reports the
 * `Personalize Runtime` service id, which is not the one a
 * `PersonalizeClient` reports.
 */
export class SimPersonalizeRuntimeSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simPersonalizeRuntime: SimPersonalizeRuntime) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "GetRecommendationsCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalizeRuntime.getRecommendations(
            command as SimGetRecommendationsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetPersonalizedRankingCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalizeRuntime.getPersonalizedRanking(
            command as SimGetPersonalizedRankingCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Personalize Runtime can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Personalize Runtime
   * supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
