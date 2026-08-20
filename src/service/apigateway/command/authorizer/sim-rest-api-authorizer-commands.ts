import type {
  SimRestApiAuthorizer,
  SimRestApiAuthorizerType,
} from "../../api/authorizer/sim-rest-api-authorizer.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import { SimApiGatewayNotFound } from "../../error/sim-api-gateway.error.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import type {
  SimCreateAuthorizerCommand,
  SimCreateAuthorizerCommandOutput,
  SimDeleteAuthorizerCommand,
  SimDeleteAuthorizerCommandInput,
  SimDeleteAuthorizerCommandOutput,
  SimGetAuthorizerCommand,
  SimGetAuthorizerCommandInput,
  SimGetAuthorizerCommandOutput,
  SimGetAuthorizersCommand,
  SimGetAuthorizersCommandOutput,
} from "./authorizer.command.js";
import { SimRestApiAuthorizerInput } from "./sim-rest-api-authorizer-input.js";

const authorizersPath = "/authorizers";

const acceptedCreateOptions = [
  "restApiId",
  "name",
  "type",
  "authorizerUri",
  "providerARNs",
  "identitySource",
  "authorizerResultTtlInSeconds",
];

const simulatedAuthorizerTypes: readonly SimRestApiAuthorizerType[] = [
  "TOKEN",
  "REQUEST",
  "COGNITO_USER_POOLS",
];

const authorizerTypeRefusal =
  "a REST API authorizer invokes a function or verifies a user pool token, " +
  "and the JWT authorizer an HTTP API takes is the v2 service's";

interface SimRestApiAuthorizerCommandsProperties {
  readonly access: SimRestApiAccess;
}

/**
 * The commands addressing the authorizers of a REST API.
 */
export class SimRestApiAuthorizerCommands {
  private readonly access: SimRestApiAccess;

  constructor(properties: SimRestApiAuthorizerCommandsProperties) {
    this.access = properties.access;
  }

  /**
   * Handle a CreateAuthorizer command.
   */
  createAuthorizer(
    command: SimCreateAuthorizerCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimCreateAuthorizerCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("CreateAuthorizer");
    unsimulated.refuseUnaccepted(input, acceptedCreateOptions);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    unsimulated.require("name", input.name);
    const type = unsimulated.require("type", input.type);
    unsimulated.refuseUnlessOneOf(
      "type",
      type,
      simulatedAuthorizerTypes,
      authorizerTypeRefusal,
    );

    const authorizerInput = new SimRestApiAuthorizerInput({
      input,
      type: type as SimRestApiAuthorizerType,
    });

    const restApi = this.access.api({
      method: "POST",
      restApiId,
      childPath: authorizersPath,
      caller: options?.caller,
    });

    const authorizer = authorizerInput.read(restApi.authorizers.allocateId());
    restApi.authorizers.add(authorizer);

    return { ...authorizer.view(), $metadata: {} };
  }

  /**
   * Handle a GetAuthorizer command.
   */
  getAuthorizer(
    command: SimGetAuthorizerCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetAuthorizerCommandOutput {
    const { restApi, authorizerId } = this.addressed(
      "GET",
      "GetAuthorizer",
      command.input,
      options,
    );

    return { ...this.declared(restApi, authorizerId).view(), $metadata: {} };
  }

  /**
   * Handle a GetAuthorizers command.
   */
  getAuthorizers(
    command: SimGetAuthorizersCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetAuthorizersCommandOutput {
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetAuthorizers");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, ["restApiId"]);
    const restApiId = unsimulated.require("restApiId", command.input.restApiId);

    const restApi = this.access.api({
      method: "GET",
      restApiId,
      childPath: authorizersPath,
      caller: options?.caller,
    });

    return {
      items: restApi.authorizers.list().map((one) => one.view()),
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteAuthorizer command.
   *
   * A method still naming the deleted authorizer keeps its authorization type
   * and refuses every request, since there is no longer anything to send the
   * request through. What real API Gateway does with such a method is not
   * established, so the method stays closed rather than being opened.
   */
  deleteAuthorizer(
    command: SimDeleteAuthorizerCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimDeleteAuthorizerCommandOutput {
    const { restApi, authorizerId } = this.addressed(
      "DELETE",
      "DeleteAuthorizer",
      command.input,
      options,
    );

    restApi.authorizers.remove(
      this.declared(restApi, authorizerId).authorizerId,
    );

    return { $metadata: {} };
  }

  /**
   * The API and authorizer id a command names, once the caller is allowed to
   * address them.
   */
  private addressed(
    accessMethod: "GET" | "DELETE",
    operation: string,
    input: SimGetAuthorizerCommandInput | SimDeleteAuthorizerCommandInput,
    options?: SimApiGatewayRequestOptions,
  ): { readonly restApi: SimRestApi; readonly authorizerId: string } {
    const unsimulated = new SimApiGatewayUnsimulatedInput(operation);
    unsimulated.refuseUnaccepted(input, ["restApiId", "authorizerId"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const authorizerId = unsimulated.require(
      "authorizerId",
      input.authorizerId,
    );

    return {
      restApi: this.access.api({
        method: accessMethod,
        restApiId,
        childPath: `${authorizersPath}/${authorizerId}`,
        caller: options?.caller,
      }),
      authorizerId,
    };
  }

  /**
   * An authorizer of this API, refusing an id it has none for.
   */
  private declared(
    restApi: SimRestApi,
    authorizerId: string,
  ): SimRestApiAuthorizer {
    const authorizer = restApi.authorizers.find(authorizerId);

    if (authorizer === undefined) {
      throw new SimApiGatewayNotFound(
        `Invalid Authorizer identifier specified: ${authorizerId}`,
      );
    }

    return authorizer;
  }
}
