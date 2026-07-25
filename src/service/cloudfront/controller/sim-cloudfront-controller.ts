import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
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

  constructor(properties: SimCloudFrontServiceControllerProperties = {}) {
    const dependenciesFactory =
      new SimCloudFrontControllerDependenciesFactory();
    const dependencies = dependenciesFactory.make(properties);

    this.pipeline = new SimCloudFrontRequestPipeline(dependencies);
  }

  /**
   * Handle one incoming request for the simulated CloudFront service.
   *
   * The `_target` is part of the shared service-controller interface, but
   * CloudFront routing is host-based, so the request itself contains the
   * information needed to find the Distribution.
   */
  async handleRequest(
    _target: SimAwsServiceTarget,
    request: Request,
  ): Promise<Response> {
    return this.pipeline.handle(request);
  }
}
