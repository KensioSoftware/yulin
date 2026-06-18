import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import type { SimCloudFrontDistroRouter } from "../router/sim-cloud-front-distro-router.js";
import { SimCloudFrontDistroRouter as DefaultSimCloudFrontDistroRouter } from "../router/sim-cloud-front-distro-router.js";
import type { SimCloudFrontBehaviorResolver } from "../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCloudFrontBehaviorResolver as DefaultSimCloudFrontBehaviorResolver } from "../resolver/sim-cloud-front-behavior-resolver.js";
import type { SimCloudFront } from "../sim-cloudfront.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCloudFrontBehavior } from "../behaviour/sim-cloud-front-behavior.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCloudFrontRegistry } from "../sim-cloud-front-registry.js";

interface SimCloudFrontServiceControllerProps {
  readonly simAws?: SimAws;
  readonly cloudFrontRegistry?: SimCloudFrontRegistry;
  readonly distroRouter?: SimCloudFrontDistroRouter;
  readonly behaviourResolver?: SimCloudFrontBehaviorResolver;
}

/**
 * Root CloudFront request controller.
 * Controls the request processing workflow across the other simulated
 * CloudFront components.
 */
export class SimCloudFrontServiceController implements SimAwsServiceController {
  private readonly distroRouter: SimCloudFrontDistroRouter;
  private readonly behaviourResolver: SimCloudFrontBehaviorResolver;

  constructor(props: SimCloudFrontServiceControllerProps = {}) {
    const simAws = props.simAws ?? new SimAws();
    const cloudFrontRegistry =
      props.cloudFrontRegistry ?? simAws._cloudFrontRegistry();

    const {
      distroRouter = new DefaultSimCloudFrontDistroRouter({
        simAws,
        cloudFrontRegistry,
      }),
      behaviourResolver = new DefaultSimCloudFrontBehaviorResolver(),
    } = props;

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

    const route = this.distroRouter.routeForRequest(req);

    if (route === undefined) {
      return new Response("Suitable sim CloudFront Distribution not found", {
        status: 404,
      });
    }

    const { cloudFront, distribution: distro } = route;

    const behaviour = this.behaviourResolver.resolve(req, distro);

    // Handle viewer-request CFF, if any.
    const cffResult = this.applyViewerRequestCff(cloudFront, req, behaviour);
    if (cffResult instanceof Response) {
      return cffResult;
    }
    req = cffResult;

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

    // Handle viewer-response CFF, if any.
    return this.applyViewerResponseCff(cloudFront, req, res, behaviour);
  }

  /**
   * Apply viewer request CloudFront Function if configured.
   */
  private applyViewerRequestCff(
    cloudFront: SimCloudFront,
    req: Request,
    behaviour: SimCloudFrontBehavior,
  ): Request | Response {
    const viewerRequestCffArn = behaviour.functionAssociations?.viewerRequest;
    if (viewerRequestCffArn === undefined) {
      return req;
    }

    const viewerRequestCff =
      cloudFront.getCloudFrontFunctionByArn(viewerRequestCffArn);
    assertDefined(
      viewerRequestCff,
      `CloudFront Function ${viewerRequestCffArn} for viewer-request`,
    );

    const viewerRequestCffResult = viewerRequestCff.handleViewerRequest(req);
    if (viewerRequestCffResult instanceof Response) {
      return viewerRequestCffResult;
    }

    return viewerRequestCffResult;
  }

  /**
   * Apply viewer response CloudFront Function if configured.
   */
  private applyViewerResponseCff(
    cloudFront: SimCloudFront,
    req: Request,
    res: Response,
    behaviour: SimCloudFrontBehavior,
  ): Response {
    const viewerResponseCffArn = behaviour.functionAssociations?.viewerResponse;
    if (viewerResponseCffArn === undefined) {
      return res;
    }

    const viewerResponseCff =
      cloudFront.getCloudFrontFunctionByArn(viewerResponseCffArn);
    assertDefined(
      viewerResponseCff,
      `CloudFront Function ${viewerResponseCffArn} for viewer-response`,
    );

    return viewerResponseCff.handleViewerResponse(req, res);
  }
}
