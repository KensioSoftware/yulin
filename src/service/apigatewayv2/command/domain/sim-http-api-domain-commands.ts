import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimHttpApiDomainName } from "../../domain/sim-http-api-domain-name.js";
import type { SimHttpApiDomainStore } from "../../domain/sim-http-api-domain-store.js";
import type { SimHttpApiDomainRegistry } from "../../registry/sim-http-api-domain-registry.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimHttpApiDomainAccess } from "../sim-http-api-domain-access.js";
import { simHttpApiDomainConfigurations } from "./sim-http-api-domain-configurations.js";
import type {
  SimCreateDomainNameCommand,
  SimCreateDomainNameCommandOutput,
  SimDeleteDomainNameCommand,
  SimDeleteDomainNameCommandOutput,
  SimGetDomainNameCommand,
  SimGetDomainNameCommandOutput,
  SimGetDomainNamesCommand,
  SimGetDomainNamesCommandOutput,
} from "./domain.command.js";

const acceptedCreateDomainNameOptions = [
  "DomainName",
  "DomainNameConfigurations",
];

interface SimHttpApiDomainCommandsProperties {
  readonly domains: SimHttpApiDomainStore;
  readonly registry: SimHttpApiDomainRegistry;
  readonly access: SimHttpApiDomainAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The commands addressing custom domain names.
 */
export class SimHttpApiDomainCommands {
  private readonly domains: SimHttpApiDomainStore;
  private readonly registry: SimHttpApiDomainRegistry;
  private readonly access: SimHttpApiDomainAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimHttpApiDomainCommandsProperties) {
    this.domains = properties.domains;
    this.registry = properties.registry;
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Handle a CreateDomainName command.
   *
   * The domain starts answering on its own hostname straight away, and serves
   * nothing until an API mapping points it at an API and a stage.
   */
  createDomainName(
    command: SimCreateDomainNameCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimCreateDomainNameCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("CreateDomainName");
    unsimulated.refuseUnaccepted(input, acceptedCreateDomainNameOptions);
    const domainName = unsimulated.require("DomainName", input.DomainName);
    const configurations = simHttpApiDomainConfigurations(
      input.DomainNameConfigurations,
      unsimulated,
    );

    this.access.authorizeCollection("POST", options?.caller);

    const domain = new SimHttpApiDomainName({
      domainName,
      accountRegionScope: this.accountRegionScope,
      configurations,
    });
    this.registry.register(domain);
    this.domains.add(domain);

    return { ...domain.view(), $metadata: {} };
  }

  /**
   * Handle a GetDomainName command.
   */
  getDomainName(
    command: SimGetDomainNameCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetDomainNameCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetDomainName");
    unsimulated.refuseUnaccepted(command.input, ["DomainName"]);
    const domainName = unsimulated.require(
      "DomainName",
      command.input.DomainName,
    );

    const domain = this.access.domain({
      method: "GET",
      domainName,
      caller: options?.caller,
    });

    return { ...domain.view(), $metadata: {} };
  }

  /**
   * Handle a GetDomainNames command.
   */
  getDomainNames(
    command: SimGetDomainNamesCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimGetDomainNamesCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("GetDomainNames");
    unsimulated.refusePaging(command.input);
    unsimulated.refuseUnaccepted(command.input, []);

    this.access.authorizeCollection("GET", options?.caller);

    return {
      Items: this.domains.list().map((domain) => domain.view()),
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteDomainName command.
   *
   * The domain's API mappings go with it, because they belong to it, and its
   * hostname stops resolving, because nothing answers on it any more. The APIs
   * it mapped are untouched and still serve their generated endpoints.
   */
  deleteDomainName(
    command: SimDeleteDomainNameCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimDeleteDomainNameCommandOutput {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("DeleteDomainName");
    unsimulated.refuseUnaccepted(command.input, ["DomainName"]);
    const domainName = unsimulated.require(
      "DomainName",
      command.input.DomainName,
    );

    const domain = this.access.domain({
      method: "DELETE",
      domainName,
      caller: options?.caller,
    });

    this.domains.remove(domain.domainName);
    this.registry.deregister(domain);

    return { $metadata: {} };
  }
}
