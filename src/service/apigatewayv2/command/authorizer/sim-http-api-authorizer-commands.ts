import { SimApiGatewayV2NotFound } from "../../error/sim-api-gateway-v2.error.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiAccess } from "../sim-http-api-access.js";
import type {
  SimCreateAuthorizerCommand,
  SimCreateAuthorizerCommandOutput,
  SimDeleteAuthorizerCommand,
  SimDeleteAuthorizerCommandOutput,
  SimGetAuthorizersCommand,
  SimGetAuthorizersCommandOutput,
} from "./authorizer.command.js";
import { simHttpApiAuthorizerInput } from "./sim-http-api-authorizer-input.js";

const authorizersPath = "/authorizers";

const acceptedCreateAuthorizerOptions = [
  "ApiId",
  "Name",
  "AuthorizerType",
  "IdentitySource",
  "JwtConfiguration",
  "AuthorizerUri",
  "AuthorizerPayloadFormatVersion",
  "EnableSimpleResponses",
  "AuthorizerResultTtlInSeconds",
];

/**
 * The authorizer types simulated.
 */
const simulatedAuthorizerTypes = ["JWT", "REQUEST"];

/**
 * The commands addressing the authorizers of an API.
 */
export class SimHttpApiAuthorizerCommands {
  private readonly access: SimHttpApiAccess;

  constructor(properties: { readonly access: SimHttpApiAccess }) {
    this.access = properties.access;
  }

  /**
   * Handle a CreateAuthorizer command.
   *
   * The two kinds of authorizer are configured by different halves of this
   * input, and which half applies is settled by the reader for the type asked
   * for, so an option written against the other kind is refused by name rather
   * than accepted and never applied.
   */
  createAuthorizer(
    command: SimCreateAuthorizerCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimCreateAuthorizerCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("CreateAuthorizer");
    unsimulated.refuseUnaccepted(input, acceptedCreateAuthorizerOptions);
    const apiId = unsimulated.require("ApiId", input.ApiId);
    unsimulated.require("Name", input.Name);
    unsimulated.require("AuthorizerType", input.AuthorizerType);
    unsimulated.refuseUnlessOneOf(
      "AuthorizerType",
      input.AuthorizerType,
      simulatedAuthorizerTypes,
      "an HTTP API has these two kinds of authorizer and no others",
    );

    const authorizerInput = simHttpApiAuthorizerInput(input);

    const api = this.access.api({
      method: "POST",
      apiId,
      childPath: authorizersPath,
      caller: options?.caller,
    });

    const authorizer = authorizerInput.read(api.authorizers.allocateId());
    api.authorizers.add(authorizer);

    return { ...authorizer.view(), $metadata: {} };
  }

  /**
   * Handle a GetAuthorizers command.
   */
  getAuthorizers(
    command: SimGetAuthorizersCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetAuthorizersCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetAuthorizers");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, ["ApiId"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);

    const api = this.access.api({
      method: "GET",
      apiId,
      childPath: authorizersPath,
      caller: options?.caller,
    });

    return {
      Items: api.authorizers.list().map((authorizer) => authorizer.view()),
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteAuthorizer command.
   *
   * A route still pointing at the deleted authorizer keeps its authorization
   * type and refuses every request, since there is no longer anything to send
   * the request through. What real API Gateway does with such a route is not
   * established, so the route stays closed rather than being opened or
   * repointed.
   */
  deleteAuthorizer(
    command: SimDeleteAuthorizerCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimDeleteAuthorizerCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("DeleteAuthorizer");
    unsimulated.refuseUnaccepted(command.input, ["ApiId", "AuthorizerId"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);
    const authorizerId = unsimulated.require(
      "AuthorizerId",
      command.input.AuthorizerId,
    );

    const api = this.access.api({
      method: "DELETE",
      apiId,
      childPath: `${authorizersPath}/${authorizerId}`,
      caller: options?.caller,
    });
    const authorizer = api.authorizers.find(authorizerId);

    if (authorizer === undefined) {
      throw new SimApiGatewayV2NotFound(
        `No authorizer with id ${authorizerId} on API ${apiId}`,
      );
    }

    api.authorizers.remove(authorizer.authorizerId);

    return { $metadata: {} };
  }
}
