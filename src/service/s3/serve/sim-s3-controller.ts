import type { SimAws } from "../../aws/sim-aws.js";
import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import { SimS3RequestRouter } from "./sim-s3-req-router.js";
import { SimS3GetObjectController } from "./sim-s3-get-obj-controller.js";
import type {
  SimAwsHttpRequest,
  SimAwsHttpResponse,
} from "../../../serve/http/sim-aws-req-res.js";

/**
 * Localhost HTTP controller for simulated S3.
 */
export class SimS3ServiceController implements SimAwsServiceController {
  private readonly router: SimS3RequestRouter;
  private readonly getObjectController: SimS3GetObjectController;

  constructor(simAws: SimAws) {
    this.router = new SimS3RequestRouter(simAws);
    this.getObjectController = new SimS3GetObjectController();
  }

  /**
   * Handle an HTTP request routed to a simulated S3 Bucket.
   */
  async handleRequest(
    target: SimAwsServiceTarget,
    request: SimAwsHttpRequest,
    response: SimAwsHttpResponse,
  ): Promise<void> {
    const route = this.router.route(target, request);

    if (route.action === "failure") {
      response.sendText(route.statusCode, route.message);
      return;
    }

    await this.getObjectController.handleRequest(
      route.bucket,
      route.objectKey,
      request,
      response,
    );
  }
}
