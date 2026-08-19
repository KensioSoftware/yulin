import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";

/**
 * The rules about where a resource can be added to a path tree.
 */
export class SimRestApiResourceRules {
  /**
   * Ensure a parent can take a child at all.
   *
   * A greedy `{proxy+}` part matches the rest of the request path, so nothing
   * can follow it.
   */
  requireParentTakesChildren(parent: SimRestApiResource): void {
    if (!parent.greedy) {
      return;
    }

    throw new SimApiGatewayBadRequest(
      `Resource ${parent.path} captures the rest of the request path, so ` +
        `nothing can be created under it`,
    );
  }
}
