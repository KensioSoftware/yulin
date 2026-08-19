import {
  SimRestApiIntegration,
  simRestApiLambdaIntegrationHttpMethod,
} from "../../api/method/sim-rest-api-integration.js";
import { SimRestApiLambdaUri } from "../../api/method/sim-rest-api-lambda-uri.js";
import {
  SimRestApiMethodAddress,
  simRestApiMethodOptions,
} from "../method/sim-rest-api-method-address.js";
import { SimRestApiMethodRules } from "../method/sim-rest-api-method-rules.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import type {
  SimGetIntegrationCommand,
  SimGetIntegrationCommandOutput,
  SimPutIntegrationCommand,
  SimPutIntegrationCommandOutput,
} from "../method/method.command.js";

const simulatedIntegrationType = "AWS_PROXY";

const acceptedPutOptions = [
  ...simRestApiMethodOptions,
  "type",
  "integrationHttpMethod",
  "uri",
];

const integrationTypeRefusal =
  "only a Lambda proxy integration is simulated, and a MOCK, HTTP, " +
  "HTTP_PROXY or non-proxy AWS integration answers a request from somewhere " +
  "this cannot reach";

const integrationMethodRefusal =
  "API Gateway always calls a Lambda integration with POST, whatever method " +
  "the client used";

interface SimRestApiIntegrationCommandsProperties {
  readonly access: SimRestApiAccess;
}

/**
 * The commands addressing what a REST API method does with a request.
 *
 * A REST API integration is part of its method rather than a resource of its
 * own, so these address the same API, resource and HTTP method the method
 * commands do.
 */
export class SimRestApiIntegrationCommands {
  private readonly address: SimRestApiMethodAddress;
  private readonly rules = new SimRestApiMethodRules();

  constructor(properties: SimRestApiIntegrationCommandsProperties) {
    this.address = new SimRestApiMethodAddress({ access: properties.access });
  }

  /**
   * Handle a PutIntegration command.
   *
   * The method has to be declared first, as it does on real AWS. An
   * integration behind no method would be unreachable, because a request is
   * matched to a method before anything looks at what is behind it.
   */
  putIntegration(
    command: SimPutIntegrationCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimPutIntegrationCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("PutIntegration");
    unsimulated.refuseUnaccepted(input, acceptedPutOptions);
    unsimulated.refuseUnless(
      "type",
      input.type,
      simulatedIntegrationType,
      integrationTypeRefusal,
    );
    unsimulated.refuseUnless(
      "integrationHttpMethod",
      input.integrationHttpMethod,
      simRestApiLambdaIntegrationHttpMethod,
      integrationMethodRefusal,
    );
    const uri = SimRestApiLambdaUri.parse(
      unsimulated.require("uri", input.uri),
    );

    const { method } = this.address.declared(
      "PUT",
      "PutIntegration",
      input,
      options,
    );
    method.integration = new SimRestApiIntegration({
      integrationType: simulatedIntegrationType,
      lambdaUri: uri,
      integrationHttpMethod: simRestApiLambdaIntegrationHttpMethod,
    });

    return { ...method.integration.view(), $metadata: {} };
  }

  /**
   * Handle a GetIntegration command.
   */
  getIntegration(
    command: SimGetIntegrationCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetIntegrationCommandOutput {
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetIntegration");
    unsimulated.refuseUnaccepted(command.input, simRestApiMethodOptions);
    const { method } = this.address.declared(
      "GET",
      "GetIntegration",
      command.input,
      options,
    );

    return { ...this.rules.requireIntegration(method).view(), $metadata: {} };
  }
}
