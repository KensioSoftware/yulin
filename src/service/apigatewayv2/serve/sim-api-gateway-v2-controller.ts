import { randomUUID } from "node:crypto";

import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimHttpApiAccessLog } from "./sim-http-api-access-log.js";
import { SimApiGatewayV2ErrorResponse } from "./sim-api-gateway-v2-error-response.js";
import { SimApiGatewayV2Router } from "./sim-api-gateway-v2-router.js";
import { SimHttpApiServePipeline } from "./sim-http-api-serve-pipeline.js";
import {
  type SimHttpApiServing,
  SimHttpApiServingResolver,
} from "./sim-http-api-serving.js";

interface SimApiGatewayV2ServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimApiGatewayV2Router;
}

/**
 * Localhost HTTP controller for simulated API Gateway HTTP APIs.
 *
 * A request reaching the generated endpoint, or a custom domain mapped to the
 * API, is matched to a route, and the route's integration invokes a simulated
 * Lambda function with a payload format 2.0 event. The function runs as its
 * execution Role, as it does for any other invocation. The throttle and the
 * authorization standing in front of that are the pipeline's.
 *
 * Every request the resolver matches is stamped with an id before anything
 * runs, so the stage's access log line, the authorizer event and the
 * integration event all name the same request, as they do on real AWS.
 */
export class SimApiGatewayV2ServiceController implements SimAwsServiceController {
  private readonly router: SimApiGatewayV2Router;
  private readonly pipeline: SimHttpApiServePipeline;
  private readonly serving: SimHttpApiServingResolver;
  private readonly accessLog: SimHttpApiAccessLog;
  private readonly errorResponse = new SimApiGatewayV2ErrorResponse();

  constructor(properties: SimApiGatewayV2ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimApiGatewayV2Router({ simAws });
    this.pipeline = new SimHttpApiServePipeline({ router: this.router });
    this.serving = new SimHttpApiServingResolver({ router: this.router });
    this.accessLog = new SimHttpApiAccessLog({
      simAws: this.router.simAws,
      clock: this.router.simAws,
    });
  }

  /**
   * Handle an HTTP request routed to a simulated HTTP API.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    const resolution = this.serving.resolve(
      serviceRequest.target,
      serviceRequest.request,
    );

    switch (resolution.kind) {
      case "notFound": {
        return this.errorResponse.notFound();
      }
      case "refusedHost": {
        return this.errorResponse.forbiddenHost();
      }
      case "served": {
        return await this.serve(resolution.serving, serviceRequest);
      }
    }
  }

  /**
   * Serve one request the resolver matched to a stage, and record it in that
   * stage's access log.
   */
  private async serve(
    resolved: SimHttpApiServing,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const serving = { ...resolved, requestId: randomUUID() };
    const at = this.router.simAws.now();
    const served = await this.pipeline.run(serving, serviceRequest);

    await this.accessLog.served(serving, serviceRequest.request, served, at);

    return served.response;
  }
}
