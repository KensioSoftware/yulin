import { SimRestApiMethod } from "../../api/method/sim-rest-api-method.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import {
  SimRestApiMethodAddress,
  simRestApiMethodOptions,
} from "./sim-rest-api-method-address.js";
import { SimRestApiMethodAuthorizationInput } from "./sim-rest-api-method-authorization.js";
import type {
  SimDeleteMethodCommand,
  SimDeleteMethodCommandOutput,
  SimGetMethodCommand,
  SimGetMethodCommandOutput,
  SimPutMethodCommand,
  SimPutMethodCommandOutput,
} from "./method.command.js";

const acceptedPutOptions = [
  ...simRestApiMethodOptions,
  "authorizationType",
  "authorizerId",
  "authorizationScopes",
  "apiKeyRequired",
  "operationName",
];

const apiKeyRefusal =
  "API keys and usage plans are not simulated, and a method requiring one " +
  "here would answer requests real AWS rejects";

interface SimRestApiMethodCommandsProperties {
  readonly access: SimRestApiAccess;
}

/**
 * The commands addressing the methods declared on a REST API resource.
 */
export class SimRestApiMethodCommands {
  private readonly address: SimRestApiMethodAddress;

  constructor(properties: SimRestApiMethodCommandsProperties) {
    this.address = new SimRestApiMethodAddress({ access: properties.access });
  }

  /**
   * Handle a PutMethod command.
   */
  putMethod(
    command: SimPutMethodCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimPutMethodCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("PutMethod");
    unsimulated.refuseUnaccepted(input, acceptedPutOptions);
    unsimulated.refuseEnabled(
      "apiKeyRequired",
      input.apiKeyRequired,
      apiKeyRefusal,
    );

    const target = this.address.target("PUT", "PutMethod", input, options);
    const method = new SimRestApiMethod({
      httpMethod: target.httpMethod,
      apiKeyRequired: false,
      operationName: input.operationName,
      ...new SimRestApiMethodAuthorizationInput({
        input,
        restApi: target.restApi,
        resource: target.resource,
        httpMethod: target.httpMethod,
      }).read(),
    });
    target.resource.addMethod(method);

    return { ...method.view(), $metadata: {} };
  }

  /**
   * Handle a GetMethod command.
   */
  getMethod(
    command: SimGetMethodCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetMethodCommandOutput {
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetMethod");
    unsimulated.refuseUnaccepted(command.input, simRestApiMethodOptions);
    const { method } = this.address.declared(
      "GET",
      "GetMethod",
      command.input,
      options,
    );

    return { ...method.view(), $metadata: {} };
  }

  /**
   * Handle a DeleteMethod command. The integration goes with the method,
   * because a REST API integration is part of the method it answers.
   */
  deleteMethod(
    command: SimDeleteMethodCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimDeleteMethodCommandOutput {
    const unsimulated = new SimApiGatewayUnsimulatedInput("DeleteMethod");
    unsimulated.refuseUnaccepted(command.input, simRestApiMethodOptions);
    const { resource, httpMethod } = this.address.declared(
      "DELETE",
      "DeleteMethod",
      command.input,
      options,
    );
    resource.removeMethod(httpMethod);

    return { $metadata: {} };
  }
}
