import type { SimHttpApiStore } from "../../api/sim-http-api-store.js";
import { SimApiMappingKey } from "../../domain/sim-api-mapping-key.js";
import { SimApiMapping } from "../../domain/sim-api-mapping.js";
import { SimApiMappingRules } from "./sim-api-mapping-rules.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiDomainAccess } from "../sim-http-api-domain-access.js";
import type {
  SimCreateApiMappingCommand,
  SimCreateApiMappingCommandOutput,
  SimDeleteApiMappingCommand,
  SimDeleteApiMappingCommandOutput,
  SimGetApiMappingCommand,
  SimGetApiMappingCommandOutput,
  SimGetApiMappingsCommand,
  SimGetApiMappingsCommandOutput,
} from "./api-mapping.command.js";

const apiMappingsPath = "/apimappings";

const acceptedCreateApiMappingOptions = [
  "DomainName",
  "ApiId",
  "Stage",
  "ApiMappingKey",
];

interface SimApiMappingCommandsProperties {
  readonly apis: SimHttpApiStore;
  readonly access: SimHttpApiDomainAccess;
}

/**
 * The commands addressing the API mappings of a custom domain name.
 *
 * A mapping points a base path of the domain at one API and one of its stages.
 * The domain and the API it maps are in the same Account and Region, as they
 * are on real AWS, so a mapping names an API id and nothing more.
 */
export class SimApiMappingCommands {
  private readonly access: SimHttpApiDomainAccess;
  private readonly rules: SimApiMappingRules;

  constructor(properties: SimApiMappingCommandsProperties) {
    this.access = properties.access;
    this.rules = new SimApiMappingRules(properties.apis);
  }

  /**
   * Handle a CreateApiMapping command.
   *
   * An empty `ApiMappingKey` serves the API at the root of the domain. A
   * non-empty one serves it under that base path, and the base path is taken
   * off the request path before the API's routes see it.
   */
  createApiMapping(
    command: SimCreateApiMappingCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimCreateApiMappingCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("CreateApiMapping");
    unsimulated.refuseUnaccepted(input, acceptedCreateApiMappingOptions);
    const domainName = unsimulated.require("DomainName", input.DomainName);
    const apiId = unsimulated.require("ApiId", input.ApiId);
    const stage = unsimulated.require("Stage", input.Stage);
    const apiMappingKey = SimApiMappingKey.parse(input.ApiMappingKey);

    const domain = this.access.domain({
      method: "POST",
      domainName,
      childPath: apiMappingsPath,
      caller: options?.caller,
    });
    this.rules.requireStage(apiId, stage);
    this.rules.requireUnusedKey(domain, apiMappingKey);

    const mapping = new SimApiMapping({
      apiMappingId: domain.apiMappings.allocateId(),
      apiMappingKey,
      apiId,
      stage,
    });
    domain.apiMappings.add(mapping);

    return { ...mapping.view(), $metadata: {} };
  }

  /**
   * Handle a GetApiMapping command.
   */
  getApiMapping(
    command: SimGetApiMappingCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetApiMappingCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetApiMapping");
    unsimulated.refuseUnaccepted(command.input, ["DomainName", "ApiMappingId"]);
    const domainName = unsimulated.require(
      "DomainName",
      command.input.DomainName,
    );
    const apiMappingId = unsimulated.require(
      "ApiMappingId",
      command.input.ApiMappingId,
    );

    const domain = this.access.domain({
      method: "GET",
      domainName,
      childPath: `${apiMappingsPath}/${apiMappingId}`,
      caller: options?.caller,
    });

    return {
      ...this.rules.requireMapping(domain, apiMappingId).view(),
      $metadata: {},
    };
  }

  /**
   * Handle a GetApiMappings command.
   */
  getApiMappings(
    command: SimGetApiMappingsCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetApiMappingsCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetApiMappings");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, ["DomainName"]);
    const domainName = unsimulated.require(
      "DomainName",
      command.input.DomainName,
    );

    const domain = this.access.domain({
      method: "GET",
      domainName,
      childPath: apiMappingsPath,
      caller: options?.caller,
    });

    return {
      Items: domain.apiMappings.list().map((mapping) => mapping.view()),
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteApiMapping command.
   *
   * The base path stops being served, and the domain and the API both stay.
   */
  deleteApiMapping(
    command: SimDeleteApiMappingCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimDeleteApiMappingCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("DeleteApiMapping");
    unsimulated.refuseUnaccepted(command.input, ["DomainName", "ApiMappingId"]);
    const domainName = unsimulated.require(
      "DomainName",
      command.input.DomainName,
    );
    const apiMappingId = unsimulated.require(
      "ApiMappingId",
      command.input.ApiMappingId,
    );

    const domain = this.access.domain({
      method: "DELETE",
      domainName,
      childPath: `${apiMappingsPath}/${apiMappingId}`,
      caller: options?.caller,
    });
    const mapping = this.rules.requireMapping(domain, apiMappingId);

    domain.apiMappings.remove(mapping.apiMappingId);

    return { $metadata: {} };
  }
}
