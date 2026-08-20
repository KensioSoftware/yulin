import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimRestApiStore } from "../../api/sim-rest-api-store.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import type { SimRestApiOpenApiDocument } from "../../openapi/sim-rest-api-openapi-document.js";
import { SimRestApiOpenApiImport } from "../../openapi/sim-rest-api-openapi-import.js";
import { SimRestApiOpenApiReplacement } from "../../openapi/sim-rest-api-openapi-replacement.js";
import type { SimRestApiRegistry } from "../../registry/sim-rest-api-registry.js";
import type { SimRestApiAuthorizerCommands } from "../authorizer/sim-rest-api-authorizer-commands.js";
import type { SimRestApiIntegrationCommands } from "../integration/sim-rest-api-integration-commands.js";
import type { SimRestApiMethodCommands } from "../method/sim-rest-api-method-commands.js";
import type { SimRestApiResourceCommands } from "../resource/sim-rest-api-resource-commands.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import type {
  SimImportRestApiCommand,
  SimImportRestApiCommandOutput,
  SimPutRestApiCommand,
  SimPutRestApiCommandOutput,
} from "./rest-api.command.js";
import type { SimRestApiCommands } from "./sim-rest-api-commands.js";
import { SimRestApiImportInput } from "./sim-rest-api-import-input.js";

interface SimRestApiImportCommandsProperties {
  readonly apis: SimRestApiStore;
  readonly registry: SimRestApiRegistry;
  readonly access: SimRestApiAccess;
  readonly apiCommands: SimRestApiCommands;
  readonly resourceCommands: SimRestApiResourceCommands;
  readonly methodCommands: SimRestApiMethodCommands;
  readonly integrationCommands: SimRestApiIntegrationCommands;
  readonly authorizerCommands: SimRestApiAuthorizerCommands;
}

/**
 * The commands that declare a REST API as an OpenAPI 3.0 document.
 *
 * AWS sorts what an import finds into three categories. An error is malformed
 * input and nothing is created. A warning is valid OpenAPI a REST API cannot
 * apply, and `failOnWarnings` decides whether the import rolls back.
 * Information is valid OpenAPI REST APIs ignore, such as `requestBody` and the
 * schemas under `responses` where no request validator names them, and it is
 * ignored silently.
 */
export class SimRestApiImportCommands {
  private readonly apis: SimRestApiStore;
  private readonly registry: SimRestApiRegistry;
  private readonly access: SimRestApiAccess;
  private readonly apiCommands: SimRestApiCommands;
  private readonly openApiImport: SimRestApiOpenApiImport;
  private readonly replacement: SimRestApiOpenApiReplacement;
  private readonly input = new SimRestApiImportInput();

  constructor(properties: SimRestApiImportCommandsProperties) {
    this.apis = properties.apis;
    this.registry = properties.registry;
    this.access = properties.access;
    this.apiCommands = properties.apiCommands;
    this.openApiImport = new SimRestApiOpenApiImport(properties);
    this.replacement = new SimRestApiOpenApiReplacement({
      resourceCommands: properties.resourceCommands,
      authorizerCommands: properties.authorizerCommands,
      openApiImport: this.openApiImport,
    });
  }

  /**
   * Handle an ImportRestApi command.
   *
   * The caller is authorized once, against the API collection CreateRestApi
   * addresses, because an import is one request and there is no API id to name
   * anything under yet.
   */
  importRestApi(
    command: SimImportRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimImportRestApiCommandOutput {
    const document = this.input.importDocument(command.input);

    const created = this.apiCommands.createRestApi(
      { input: { name: document.title() } },
      options,
    );

    const restApi = this.apis.find(created.id);
    assertDefined(
      restApi,
      `sim REST API ${created.id} after ImportRestApi made it`,
    );
    this.importInto(restApi, document);

    return created;
  }

  /**
   * Handle a PutRestApi command, which replaces an API's whole definition.
   */
  putRestApi(
    command: SimPutRestApiCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimPutRestApiCommandOutput {
    const document = this.input.putDocument(command.input);
    const unsimulated = new SimApiGatewayUnsimulatedInput("PutRestApi");
    const restApiId = unsimulated.require("restApiId", command.input.restApiId);

    const restApi = this.access.api({
      method: "PUT",
      restApiId,
      caller: options?.caller,
    });

    restApi.name = document.title();
    this.replacement.over(restApi, document);

    return { ...restApi.view(), $metadata: {} };
  }

  /**
   * Create everything the document declares, leaving no API behind if any of
   * it is refused.
   *
   * That is the error category AWS describes: a document it refuses creates
   * nothing. A half-imported API would serve some of its methods and answer
   * 403 for the rest, which is worse than not having been created.
   */
  private importInto(
    restApi: SimRestApi,
    document: SimRestApiOpenApiDocument,
  ): void {
    try {
      this.openApiImport.into(restApi, document);
    } catch (error) {
      this.apis.remove(restApi.apiId);
      this.registry.deregisterApi(restApi.apiId);

      throw error;
    }
  }
}
