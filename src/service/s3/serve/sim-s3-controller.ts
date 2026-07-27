import { SimAws } from "../../aws/sim-aws.js";
import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimS3RequestRouter } from "./sim-s3-request-router.js";
import { SimS3GetObjectController } from "./sim-s3-get-object-controller.js";
import { SimS3RestController } from "./sim-s3-rest-controller.js";

interface SimS3ServiceControllerProperties {
  readonly simAws?: SimAws;
}

/**
 * Localhost HTTP controller for simulated S3.
 *
 * S3 answers on two endpoints that behave differently, so a request is routed
 * by the hostname it arrived on before anything else: the website endpoint
 * serves a static site to anyone, and the REST endpoint serves the API to
 * whoever the request is authenticated as.
 */
export class SimS3ServiceController implements SimAwsServiceController {
  private readonly s3Router: SimS3RequestRouter;
  private readonly s3GetObjectController: SimS3GetObjectController;
  private readonly s3RestController: SimS3RestController;

  constructor(properties: SimS3ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.s3Router = new SimS3RequestRouter({ simAws });
    this.s3GetObjectController = new SimS3GetObjectController();
    this.s3RestController = new SimS3RestController({ simAws });
  }

  /**
   * Handle an HTTP request routed to a simulated S3 Bucket.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    const { target, request } = serviceRequest;
    const route = this.s3Router.route(target, request);

    if (route.action === "failure") {
      return new Response(route.message, {
        status: route.statusCode,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    if (route.action === "restObject") {
      return await this.s3RestController.handleRequest(route, serviceRequest);
    }

    return await this.s3GetObjectController.handleRequest(
      route.bucket,
      route.objectKey,
      request,
    );
  }
}
