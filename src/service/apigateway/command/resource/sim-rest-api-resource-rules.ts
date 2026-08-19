import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";

/**
 * The rules about where a resource can be added to a path tree and which ones
 * can be taken out of it.
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

  /**
   * Ensure a resource can be deleted. Every REST API has a root resource, and
   * deleting it would leave the API with no tree to hang a path on.
   */
  requireDeletable(resource: SimRestApiResource): void {
    if (resource.parentId !== undefined) {
      return;
    }

    throw new SimApiGatewayBadRequest(
      "The root resource cannot be deleted, as every REST API has one",
    );
  }
}
