import type { SimRestApi } from "../api/sim-rest-api.js";
import type { SimRestApiAuthorizerCommands } from "../command/authorizer/sim-rest-api-authorizer-commands.js";
import type { SimRestApiResourceCommands } from "../command/resource/sim-rest-api-resource-commands.js";
import type { SimRestApiOpenApiDocument } from "./sim-rest-api-openapi-document.js";
import type { SimRestApiOpenApiImport } from "./sim-rest-api-openapi-import.js";

interface SimRestApiOpenApiReplacementProperties {
  readonly resourceCommands: SimRestApiResourceCommands;
  readonly authorizerCommands: SimRestApiAuthorizerCommands;
  readonly openApiImport: SimRestApiOpenApiImport;
}

/**
 * Replaces an API's whole definition with the one a document declares, which
 * is what `PutRestApi` in overwrite mode asks for.
 *
 * The API itself stays, so its id, its endpoint and the stages serving it all
 * survive the replacement.
 */
export class SimRestApiOpenApiReplacement {
  private readonly resourceCommands: SimRestApiResourceCommands;
  private readonly authorizerCommands: SimRestApiAuthorizerCommands;
  private readonly openApiImport: SimRestApiOpenApiImport;

  constructor(properties: SimRestApiOpenApiReplacementProperties) {
    this.resourceCommands = properties.resourceCommands;
    this.authorizerCommands = properties.authorizerCommands;
    this.openApiImport = properties.openApiImport;
  }

  /**
   * Put a document over an API's existing definition.
   *
   * A refused document leaves the API with an empty path tree rather than with
   * the half of it that was read before the refusal. The API is then plainly
   * serving nothing, which is what the next request to it says, where a
   * half-replaced one would answer some paths and not others.
   */
  over(restApi: SimRestApi, document: SimRestApiOpenApiDocument): void {
    this.empty(restApi);

    try {
      this.openApiImport.into(restApi, document);
    } catch (error) {
      this.empty(restApi);

      throw error;
    }
  }

  /**
   * Delete the whole definition, through the ordinary commands.
   *
   * Only the resources directly under the root are named, because deleting one
   * takes its subtree with it. The root itself stays, since every REST API has
   * one. The authorizers go with the methods that named them, since a document
   * declares the authorizers of the API it replaces along with everything
   * else, and each import of the same document would otherwise create another
   * authorizer nothing names.
   */
  private empty(restApi: SimRestApi): void {
    for (const child of restApi.resources.children(
      restApi.rootResource.resourceId,
    )) {
      this.resourceCommands.deleteResource({
        input: { restApiId: restApi.apiId, resourceId: child.resourceId },
      });
    }

    for (const authorizer of restApi.authorizers.list()) {
      this.authorizerCommands.deleteAuthorizer({
        input: {
          restApiId: restApi.apiId,
          authorizerId: authorizer.authorizerId,
        },
      });
    }
  }
}
