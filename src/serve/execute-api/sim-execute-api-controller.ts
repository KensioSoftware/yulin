import { SimApiGatewayServiceController } from "../../service/apigateway/serve/sim-api-gateway-controller.js";
import { SimApiGatewayV2ServiceController } from "../../service/apigatewayv2/serve/sim-api-gateway-v2-controller.js";
import type { SimAws } from "../../service/aws/sim-aws.js";
import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../controller/sim-service-controller.js";

interface SimExecuteApiControllerProperties {
  readonly simAws: SimAws;
}

/**
 * Localhost HTTP controller for the `execute-api` endpoint.
 *
 * API Gateway issues both of its API kinds an endpoint under one hostname
 * shape, `<api-id>.execute-api.<region>.amazonaws.com`, and a REST API id
 * looks exactly like an HTTP API id. The hostname therefore says which
 * endpoint was addressed and not which service owns it, so the request is
 * handed to whichever service allocated the id.
 *
 * That split is made here rather than while the hostname is resolved, for the
 * same reason a load balancer's DNS name resolves before anything asks whether
 * a load balancer still answers on it. Resolution recognises shape, and what
 * exists is settled when the request is routed.
 *
 * An id neither service allocated goes to the HTTP API controller, which
 * answers for an API that is not there.
 */
export class SimExecuteApiController implements SimAwsServiceController {
  private readonly simAws: SimAws;
  private readonly restApis: SimApiGatewayServiceController;
  private readonly httpApis: SimApiGatewayV2ServiceController;

  constructor(properties: SimExecuteApiControllerProperties) {
    this.simAws = properties.simAws;
    this.restApis = new SimApiGatewayServiceController({
      simAws: this.simAws,
    });
    this.httpApis = new SimApiGatewayV2ServiceController({
      simAws: this.simAws,
    });
  }

  /**
   * Hand the request to the service that owns the API id it addressed.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    return await this.owner(serviceRequest.target.resourceName).handleRequest(
      serviceRequest,
    );
  }

  private owner(apiId: string): SimAwsServiceController {
    const isRestApi =
      this.simAws.serviceFactory.registries.restApi.accountIdForApi(apiId) !==
      undefined;

    return isRestApi ? this.restApis : this.httpApis;
  }
}
