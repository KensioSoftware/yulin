import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimHttpApiJwtIssuerKeys } from "../../api/authorizer/sim-http-api-jwt-issuer-keys.js";
import { SimHttpApi } from "../../api/sim-http-api.js";
import type { SimHttpApiStore } from "../../api/sim-http-api-store.js";
import type { SimHttpApiRegistry } from "../../registry/sim-http-api-registry.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiAccess } from "../sim-http-api-access.js";
import type {
  SimCreateApiCommand,
  SimCreateApiCommandOutput,
  SimDeleteApiCommand,
  SimDeleteApiCommandOutput,
  SimGetApiCommand,
  SimGetApiCommandOutput,
  SimGetApisCommand,
  SimGetApisCommandOutput,
} from "./api.command.js";

const acceptedCreateApiOptions = [
  "Name",
  "ProtocolType",
  "Description",
  "DisableExecuteApiEndpoint",
];

interface SimHttpApiCommandsProperties {
  readonly apis: SimHttpApiStore;
  readonly registry: SimHttpApiRegistry;
  readonly access: SimHttpApiAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
  readonly jwtIssuerKeys: SimHttpApiJwtIssuerKeys;
}

/**
 * The commands addressing APIs themselves.
 */
export class SimHttpApiCommands {
  private readonly apis: SimHttpApiStore;
  private readonly registry: SimHttpApiRegistry;
  private readonly access: SimHttpApiAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: SimClock;
  private readonly jwtIssuerKeys: SimHttpApiJwtIssuerKeys;

  constructor(properties: SimHttpApiCommandsProperties) {
    this.apis = properties.apis;
    this.registry = properties.registry;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
    this.jwtIssuerKeys = properties.jwtIssuerKeys;
  }

  /**
   * Handle a CreateApi command.
   */
  createApi(
    command: SimCreateApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimCreateApiCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("CreateApi");
    unsimulated.refuseUnaccepted(input, acceptedCreateApiOptions);
    const name = unsimulated.require("Name", input.Name);
    unsimulated.require("ProtocolType", input.ProtocolType);
    unsimulated.refuseUnless(
      "ProtocolType",
      input.ProtocolType,
      "HTTP",
      "WebSocket APIs are not simulated",
    );

    this.access.authorizeCollection("POST", options?.caller);

    const api = new SimHttpApi({
      apiId: this.registry.allocateApiId(this.accountRegionScope.accountId),
      name,
      protocolType: "HTTP",
      accountRegionScope: this.accountRegionScope,
      createdDate: this.clock.now(),
      jwtIssuerKeys: this.jwtIssuerKeys,
      description: input.Description,
      disableExecuteApiEndpoint: input.DisableExecuteApiEndpoint,
    });
    this.apis.add(api);

    return { ...api.view(), $metadata: {} };
  }

  /**
   * Handle a GetApi command.
   */
  getApi(
    command: SimGetApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetApiCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetApi");
    unsimulated.refuseUnaccepted(command.input, ["ApiId"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);

    const api = this.access.api({
      method: "GET",
      apiId,
      caller: options?.caller,
    });

    return { ...api.view(), $metadata: {} };
  }

  /**
   * Handle a GetApis command.
   */
  getApis(
    command: SimGetApisCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetApisCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetApis");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, []);

    this.access.authorizeCollection("GET", options?.caller);

    return {
      Items: this.apis.list().map((api) => api.view()),
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteApi command.
   *
   * The API's routes, integrations and stages go with it, because they belong
   * to it, and its id stops resolving, because nothing serves it any more.
   */
  deleteApi(
    command: SimDeleteApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimDeleteApiCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("DeleteApi");
    unsimulated.refuseUnaccepted(command.input, ["ApiId"]);
    const apiId = unsimulated.require("ApiId", command.input.ApiId);

    const api = this.access.api({
      method: "DELETE",
      apiId,
      caller: options?.caller,
    });

    this.apis.remove(api.apiId);
    this.registry.deregisterApi(api.apiId);

    return { $metadata: {} };
  }
}
