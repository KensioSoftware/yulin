import type {
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/index.js";
import { simPersonalizeDataRoutes } from "./route/sim-personalize-data-routes.js";
import { simPersonalizeModelRoutes } from "./route/sim-personalize-model-routes.js";
import type { SimPersonalize } from "../sim-personalize.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Personalize.
 *
 * The routes arrive in two groups, split the way the service facade splits its
 * operations. Thirty-four one-line delegations in one file is over the line
 * limit, and the data and model halves are the seam already there.
 */
export class SimPersonalizeSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simPersonalize: SimPersonalize) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      ...simPersonalizeDataRoutes(simPersonalize),
      ...simPersonalizeModelRoutes(simPersonalize),
    ]);
  }

  /**
   * The SDK Command names simulated Personalize can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Personalize supports
   * it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
