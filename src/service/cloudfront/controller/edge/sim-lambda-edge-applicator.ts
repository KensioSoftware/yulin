import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { SimLambdaEdgeEventAdapter } from "../../edge/adapter/sim-lambda-edge-event-adapter.js";
import type { SimCfEdgeFunctions } from "../../edge/sim-cf-edge-functions.js";
import { simCfEdgeDistributionConfig } from "./sim-lambda-edge-distribution.js";
import { runEdgeFunction } from "./sim-lambda-edge-run.js";

interface SimLambdaEdgeApplicatorProperties {
  /**
   * Where the associated function versions are found and run.
   *
   * A controller built without a simulated Lambda to reach has none, and a
   * Behavior associating a function answers the viewer with a 502.
   */
  readonly edgeFunctions?: SimCfEdgeFunctions | undefined;
}

/**
 * Runs the Lambda@Edge functions a resolved Behavior associates at the viewer
 * events. `SimLambdaEdgeOriginApplicator` runs the two either side of the
 * Origin fetch.
 *
 * A function that throws answers the viewer with a 502 and takes the request
 * no further, which is what CloudFront does with a failed edge function. The
 * error itself reaches the function's own logs and nothing else, here as
 * there.
 */
export class SimLambdaEdgeApplicator {
  private readonly eventAdapter = new SimLambdaEdgeEventAdapter();
  private readonly edgeFunctions: SimCfEdgeFunctions | undefined;

  constructor(properties: SimLambdaEdgeApplicatorProperties = {}) {
    this.edgeFunctions = properties.edgeFunctions;
  }

  /**
   * Run the viewer-request function, if the Behavior associates one.
   *
   * Answers with the request to carry on to the Origin with, or the response a
   * function generated instead.
   */
  async applyViewerRequest(
    request: Request,
    distribution: SimCloudFrontDistribution,
    behaviour: SimCloudFrontBehavior,
  ): Promise<Request | Response> {
    const association = behaviour.lambdaFunctionAssociations?.viewerRequest;
    const edgeFunctions = this.edgeFunctions;

    if (association === undefined || edgeFunctions === undefined) {
      return request;
    }

    return await runEdgeFunction(association, async () => {
      const event = await this.eventAdapter.toRequestEvent(
        request,
        association.includeBody,
        simCfEdgeDistributionConfig(distribution),
      );

      return this.eventAdapter.fromRequestResult(
        (await edgeFunctions.invoke(
          association.functionArn,
          event,
        )) as LambdaAtEdge.RequestResult,
        request,
      );
    });
  }

  /**
   * Run the viewer-response function, if the Behavior associates one.
   */
  async applyViewerResponse(
    request: Request,
    response: Response,
    distribution: SimCloudFrontDistribution,
    behaviour: SimCloudFrontBehavior,
  ): Promise<Response> {
    const association = behaviour.lambdaFunctionAssociations?.viewerResponse;
    const edgeFunctions = this.edgeFunctions;

    if (association === undefined || edgeFunctions === undefined) {
      return response;
    }

    return await runEdgeFunction(association, async () => {
      const event = await this.eventAdapter.toResponseEvent(
        request,
        response,
        simCfEdgeDistributionConfig(distribution),
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
