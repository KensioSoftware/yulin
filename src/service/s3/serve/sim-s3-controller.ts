import { SimAws } from "../../aws/sim-aws.js";
import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimS3RequestRouter } from "./sim-s3-request-router.js";
import { SimS3GetObjectController } from "./sim-s3-get-object-controller.js";

interface SimS3ServiceControllerProperties {
  readonly simAws?: SimAws;
}

/**
 * Localhost HTTP controller for simulated S3.
 */
export class SimS3ServiceController implements SimAwsServiceController {
  private readonly s3Router: SimS3RequestRouter;
  private readonly s3GetObjectController: SimS3GetObjectController;

  constructor(properties: SimS3ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.s3Router = new SimS3RequestRouter({ simAws });
    this.s3GetObjectController = new SimS3GetObjectController();
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

    return this.s3GetObjectController.handleRequest(
      route.bucket,
      route.objectKey,
      request,
    );
  }
}
