import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import type { SimHttpApiStore } from "../../api/sim-http-api-store.js";
import type { SimHttpApiOpenApiDocument } from "../../openapi/sim-http-api-openapi-document.js";
import { SimHttpApiOpenApiImport } from "../../openapi/sim-http-api-openapi-import.js";
import type { SimHttpApiRegistry } from "../../registry/sim-http-api-registry.js";
import type { SimHttpApiAuthorizerCommands } from "../authorizer/sim-http-api-authorizer-commands.js";
import type { SimHttpApiIntegrationCommands } from "../integration/sim-http-api-integration-commands.js";
import type { SimHttpApiRouteCommands } from "../route/sim-http-api-route-commands.js";
import type { SimApiGatewayV2RequestOptions } from "../sim-api-gateway-v2-request-options.js";
import type {
  SimImportApiCommand,
  SimImportApiCommandOutput,
} from "./api.command.js";
import type { SimHttpApiCommands } from "./sim-http-api-commands.js";
import { SimHttpApiImportInput } from "./sim-http-api-import-input.js";

interface SimHttpApiImportCommandsProperties {
  readonly apis: SimHttpApiStore;
  readonly registry: SimHttpApiRegistry;
  readonly apiCommands: SimHttpApiCommands;
  readonly authorizerCommands: SimHttpApiAuthorizerCommands;
  readonly integrationCommands: SimHttpApiIntegrationCommands;
  readonly routeCommands: SimHttpApiRouteCommands;
}

/**
 * The ImportApi command, which creates an API and everything under it from an
 * OpenAPI 3.0 document.
 *
 * AWS sorts what an import finds into three categories. An error is malformed
 * input and nothing is created. A warning is valid OpenAPI an HTTP API cannot
 * apply, and `FailOnWarnings` decides whether the import rolls back.
 * Information is valid OpenAPI HTTP APIs do not support, such as `requestBody`
 * and the schemas under `responses`, and it is ignored silently.
 */
export class SimHttpApiImportCommands {
  private readonly apis: SimHttpApiStore;
  private readonly registry: SimHttpApiRegistry;
  private readonly apiCommands: SimHttpApiCommands;
  private readonly openApiImport: SimHttpApiOpenApiImport;

  constructor(properties: SimHttpApiImportCommandsProperties) {
    this.apis = properties.apis;
    this.registry = properties.registry;
    this.apiCommands = properties.apiCommands;
    this.openApiImport = new SimHttpApiOpenApiImport({
      authorizerCommands: properties.authorizerCommands,
      integrationCommands: properties.integrationCommands,
      routeCommands: properties.routeCommands,
    });
  }

  /**
   * Handle an ImportApi command.
   *
   * The caller is authorized once, against the API collection CreateApi
   * addresses, because an import is one request and there is no API id to name
   * anything under yet.
   */
  importApi(
    command: SimImportApiCommand,
    options?: SimApiGatewayV2RequestOptions,
  ): SimImportApiCommandOutput {
    const document = new SimHttpApiImportInput(command.input).document();

    const created = this.apiCommands.createApi(
      { input: { Name: document.title(), ProtocolType: "HTTP" } },
      options,
    );

    const api = this.apis.find(created.ApiId);
    assertDefined(api, `sim HTTP API ${created.ApiId} after ImportApi made it`);
    this.importInto(api, document);

    return created;
  }

  /**
   * Create everything the document declares, leaving no API behind if any of
   * it is refused.
   *
   * That is the error category AWS describes: a document it refuses creates
   * nothing. A half-imported API would serve some of its routes and answer 404
   * for the rest, which is worse than not having been created.
   */
  private importInto(
    api: SimHttpApi,
    document: SimHttpApiOpenApiDocument,
  ): void {
    try {
      this.openApiImport.into(api.apiId, document);
    } catch (error) {
      this.apis.remove(api.apiId);
      this.registry.deregisterApi(api.apiId);

      throw error;
    }
  }
}
