import type { SimAws } from "../../aws/sim-aws.js";
import type { SimS3Services } from "../install-sim-s3.js";
import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import { SimS3RequestRouter } from "./sim-s3-req-router.js";
import { SimS3GetObjectController } from "./sim-s3-get-obj-controller.js";

/**
 * Localhost HTTP controller for simulated S3.
 */
export class SimS3ServiceController implements SimAwsServiceController {
  private readonly router: SimS3RequestRouter;
  private readonly getObjectController: SimS3GetObjectController;

  constructor(simAws: SimAws<SimS3Services>) {
    this.router = new SimS3RequestRouter(simAws);
    this.getObjectController = new SimS3GetObjectController();
  }

  /**
   * Handle an HTTP request routed to a simulated S3 Bucket.
   */
  async handleRequest(
    target: SimAwsServiceTarget,
    request: Request,
  ): Promise<Response> {
    const route = this.router.route(target, request);

    if (route.action === "failure") {
      return new Response(route.message, {
        status: route.statusCode,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    return this.getObjectController.handleRequest(
      route.bucket,
      route.objectKey,
      request,
    );
  }
}
