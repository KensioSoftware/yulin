import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import type { SimCloudFrontDistroRouter } from "../router/sim-cloud-front-distro-router.js";
import { SimCloudFrontDistroRouter as DefaultSimCloudFrontDistroRouter } from "../router/sim-cloud-front-distro-router.js";
import type { SimCloudFrontBehaviorResolver } from "../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCloudFrontBehaviorResolver as DefaultSimCloudFrontBehaviorResolver } from "../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCloudFront } from "../sim-cloudfront.js";
import type { SimCloudFrontFunctionName } from "../cff/sim-cloudfront-function.js";
import { assertDefined } from "../../../util/defined/defined.js";

interface SimCloudFrontServiceControllerProps {
  readonly cloudFront?: SimCloudFront;
  readonly distroRouter?: SimCloudFrontDistroRouter;
  readonly behaviourResolver?: SimCloudFrontBehaviorResolver;
}

/**
 * Root CloudFront request controller within an Account scope.
 * Controls the request processing workflow across the other simulated
 * CloudFront components.
 */
export class SimCloudFrontServiceController implements SimAwsServiceController {
  private readonly simCloudFront: SimCloudFront;
  private readonly distroRouter: SimCloudFrontDistroRouter;
  private readonly behaviourResolver: SimCloudFrontBehaviorResolver;

  constructor(props: SimCloudFrontServiceControllerProps = {}) {
    const {
      cloudFront = new SimCloudFront(),
      distroRouter = new DefaultSimCloudFrontDistroRouter({
        distributions: cloudFront.getDistributions(),
      }),
      behaviourResolver = new DefaultSimCloudFrontBehaviorResolver(),
    } = props;

    this.simCloudFront = cloudFront;
    this.distroRouter = distroRouter;
    this.behaviourResolver = behaviourResolver;
  }

  /**
   * Handle a sim CloudFront request by coordinating across other sim CloudFront
   * components.
   */
  async handleRequest(
    _target: SimAwsServiceTarget,
    request: Request,
  ): Promise<Response> {
    let req = request;

    const distro = this.distroRouter.distroForRequest(req);

    if (distro === undefined) {
      return new Response("Suitable sim CloudFront Distribution not found", {
        status: 404,
      });
    }

    const behaviour = this.behaviourResolver.resolve(req, distro);

    // TODO: tidy up CFF resolution.
    const viewerRequestCffArn = behaviour.functionAssociations?.viewerRequest;
    if (viewerRequestCffArn !== undefined) {
      const viewerRequestCff = this.simCloudFront.getCloudFrontFunction(
        viewerRequestCffArn.split("/").pop() as SimCloudFrontFunctionName,
      );
      assertDefined(
        viewerRequestCff,
        `CloudFront Function ${viewerRequestCffArn} for viewer-request`,
      );
      const viewerRequestCffResult = viewerRequestCff.handleViewerRequest(req);
      if (viewerRequestCffResult instanceof Response) {
        return viewerRequestCffResult;
      }
      req = viewerRequestCffResult;
    }

    const origin = distro.getOrigin(behaviour.targetOriginName);
    if (origin === undefined) {
      return new Response(
        `Sim CloudFront Distribution misconfigured for Origin ${behaviour.targetOriginName}`,
        {
          status: 501,
        },
      );
    }

    const res = await origin.fetch({
      req,
      distribution: distro,
      behavior: behaviour,
    });

    // TODO: tidy up CFF resolution.
    const viewerResponseCffArn = behaviour.functionAssociations?.viewerResponse;
    if (viewerResponseCffArn !== undefined) {
      const viewerResponseCff = this.simCloudFront.getCloudFrontFunction(
        viewerResponseCffArn.split("/").pop() as SimCloudFrontFunctionName,
      );
      assertDefined(
        viewerResponseCff,
        `CloudFront Function ${viewerResponseCffArn} for viewer-response`,
      );
      return viewerResponseCff.handleViewerResponse(req, res);
    }

    return res;
  }
}
