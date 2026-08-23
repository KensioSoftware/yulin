import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { SimLambdaEdgeOriginEventAdapter } from "../../edge/adapter/sim-lambda-edge-origin-event-adapter.js";
import type { SimCfEdgeFunctions } from "../../edge/sim-cf-edge-functions.js";
import type { SimCfOriginBoundRequest } from "../origin/sim-cf-origin-bound-request.js";
import { simCfEdgeDistributionConfig } from "./sim-lambda-edge-distribution.js";
import { runEdgeFunction } from "./sim-lambda-edge-run.js";

interface SimLambdaEdgeOriginApplicatorProperties {
  /**
   * Where the associated function versions are found and run. A controller
   * built without a simulated Lambda to reach has none, and a Behavior
   * associating a function answers the viewer with a 502.
   */
  readonly edgeFunctions?: SimCfEdgeFunctions | undefined;
}

/**
 * Runs the Lambda@Edge functions a resolved Behavior associates at the two
 * origin events, either side of the Origin fetch.
 *
 * An origin-request function is told which Origin the Behavior resolved, and
 * what it hands back is what the fetch uses. An origin-response function is
 * told what the Origin answered, and what it hands back is what carries on
 * towards the viewer.
 */
export class SimLambdaEdgeOriginApplicator {
  private readonly eventAdapter = new SimLambdaEdgeOriginEventAdapter();
  private readonly edgeFunctions: SimCfEdgeFunctions | undefined;

  constructor(properties: SimLambdaEdgeOriginApplicatorProperties = {}) {
    this.edgeFunctions = properties.edgeFunctions;
  }

  /**
   * Run the origin-request function, if the Behavior associates one.
   *
   * Answers with the request and the Origin to fetch it from, or with the
   * response a handler generated instead, which the Origin is never read for.
   */
  async applyOriginRequest(
    bound: SimCfOriginBoundRequest,
    distribution: SimCloudFrontDistribution,
    behaviour: SimCloudFrontBehavior,
  ): Promise<SimCfOriginBoundRequest | Response> {
    const association = behaviour.lambdaFunctionAssociations?.originRequest;
    const edgeFunctions = this.edgeFunctions;

    if (association === undefined || edgeFunctions === undefined) {
      return bound;
    }

    return await runEdgeFunction(association, async () => {
      const edgeOrigin = bound.origin.toEdgeOrigin();
      const event = await this.eventAdapter.toOriginRequestEvent(
        bound.request,
        association.includeBody,
        simCfEdgeDistributionConfig(distribution),
        edgeOrigin,
      );

      const result = this.eventAdapter.fromOriginRequestResult(
        (await edgeFunctions.invoke(
          association.functionArn,
          event,
        )) as LambdaAtEdge.RequestResult,
        bound.request,
        edgeOrigin,
      );

      if (result instanceof Response) {
        return result;
      }

      return {
        request: result.request,
        origin: bound.origin.withEdgeOrigin(result.origin),
      };
    });
  }

  /**
   * Run the origin-response function, if the Behavior associates one.
   *
   * This one runs whatever the Origin answered, including a 400 and above.
   * That is where the origin events differ from the viewer events, and
   * CloudFront states it.
   */
  async applyOriginResponse(
    bound: SimCfOriginBoundRequest,
    response: Response,
    distribution: SimCloudFrontDistribution,
    behaviour: SimCloudFrontBehavior,
  ): Promise<Response> {
    const association = behaviour.lambdaFunctionAssociations?.originResponse;
    const edgeFunctions = this.edgeFunctions;

    if (association === undefined || edgeFunctions === undefined) {
      return response;
    }

    return await runEdgeFunction(association, async () => {
      const event = await this.eventAdapter.toOriginResponseEvent(
        bound.request,
        response,
        simCfEdgeDistributionConfig(distribution),
        bound.origin.toEdgeOrigin(),
      );

      return this.eventAdapter.fromResponseResult(
        (await edgeFunctions.invoke(
          association.functionArn,
          event,
        )) as LambdaAtEdge.Response,
        response,
      );
    });
  }
}
