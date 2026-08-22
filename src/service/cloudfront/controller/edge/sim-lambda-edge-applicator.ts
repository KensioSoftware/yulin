import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { SimLambdaEdgeEventAdapter } from "../../edge/adapter/sim-lambda-edge-event-adapter.js";
import type { SimCfEdgeAssociation } from "../../edge/sim-cf-edge-association.js";
import type { SimCfEdgeFunctions } from "../../edge/sim-cf-edge-functions.js";
import { simCfEdgeDistributionConfig } from "./sim-lambda-edge-distribution.js";

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
 * Runs the Lambda@Edge functions a resolved Behavior associates.
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

    return await this.running(association, async () => {
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

    return await this.running(association, async () => {
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

  /**
   * Run one edge function, answering with the 502 a failed one gets.
   *
   * A handler that threw, a handler that answered with something the adapter
   * cannot read as a request or a response, and a request whose body could not
   * be read into the event, are all the same thing to CloudFront. Each is a
   * failure at the edge the viewer sees as a 502, which is why building the
   * event happens in here rather than before it.
   */
  private async running<TResult extends Request | Response>(
    association: SimCfEdgeAssociation,
    run: () => Promise<TResult>,
  ): Promise<TResult | Response> {
    try {
      return await run();
    } catch {
      return new Response(
        `The Lambda@Edge function ${association.functionArn} failed`,
        { status: 502 },
      );
    }
  }
}
