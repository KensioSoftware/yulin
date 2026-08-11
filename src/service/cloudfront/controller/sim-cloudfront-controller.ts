import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimCloudFrontErrorResponse } from "./sim-cloudfront-error-response.js";
import { SimCloudFrontRequestPipeline } from "./sim-cloudfront-request-pipeline.js";
import {
  SimCloudFrontControllerDependenciesFactory,
  type SimCloudFrontServiceControllerProperties as SimCloudFrontServiceControllerProperties,
} from "./dependency/sim-cf-controller-dependency.js";

/**
 * Root HTTP entry point for simulated CloudFront requests.
 *
 * This class adapts the shared service-controller interface to CloudFront's
 * request pipeline. Construction of default collaborators lives in the
 * dependency factory, and the request lifecycle lives in the request pipeline,
 * so this controller stays a thin adapter.
 */
export class SimCloudFrontServiceController implements SimAwsServiceController {
  private readonly pipeline: SimCloudFrontRequestPipeline;
  private readonly errors = new SimCloudFrontErrorResponse();

  constructor(properties: SimCloudFrontServiceControllerProperties = {}) {
    const dependenciesFactory =
      new SimCloudFrontControllerDependenciesFactory();
    const dependencies = dependenciesFactory.make(properties);

    this.pipeline = new SimCloudFrontRequestPipeline(dependencies);
  }

  /**
   * Handle one incoming request for the simulated CloudFront service.
   *
   * The service request carries the resolved target and caller, but CloudFront
   * routing is host-based and a Distribution has no IAM authorization of its
   * own, so only the request itself is needed to find and serve it.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    try {
      return await this.pipeline.handle(serviceRequest.request);
    } catch (error) {
      return this.errors.build(error);
    }
  }
}
