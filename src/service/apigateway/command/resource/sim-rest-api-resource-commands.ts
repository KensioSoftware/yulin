import { SimRestApiPathPart } from "../../api/resource/sim-rest-api-path-part.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import { simRestApiResourceEmbedOf } from "./sim-rest-api-resource-embed.js";
import { SimRestApiResourceRules } from "./sim-rest-api-resource-rules.js";
import type {
  SimCreateResourceCommand,
  SimCreateResourceCommandOutput,
  SimDeleteResourceCommand,
  SimDeleteResourceCommandOutput,
  SimGetResourceCommand,
  SimGetResourceCommandOutput,
  SimGetResourcesCommand,
  SimGetResourcesCommandOutput,
} from "./resource.command.js";

const resourcesPath = "/resources";

interface SimRestApiResourceCommandsProperties {
  readonly access: SimRestApiAccess;
}

/**
 * The commands addressing the path tree of a REST API.
 */
export class SimRestApiResourceCommands {
  private readonly access: SimRestApiAccess;
  private readonly rules = new SimRestApiResourceRules();

  constructor(properties: SimRestApiResourceCommandsProperties) {
    this.access = properties.access;
  }

  /**
   * Handle a CreateResource command.
   */
  createResource(
    command: SimCreateResourceCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimCreateResourceCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("CreateResource");
    unsimulated.refuseUnaccepted(input, ["restApiId", "parentId", "pathPart"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const parentId = unsimulated.require("parentId", input.parentId);
    const pathPart = SimRestApiPathPart.parse(
      unsimulated.require("pathPart", input.pathPart),
    );

    const restApi = this.access.api({
      method: "POST",
      restApiId,
      childPath: resourcesPath,
      caller: options?.caller,
    });
    const parent = restApi.requireResource(parentId);
    this.rules.requireParentTakesChildren(parent);
    const resource = restApi.resources.addChild(parent, pathPart);

    return { ...resource.view(), $metadata: {} };
  }

  /**
   * Handle a GetResource command.
   */
  getResource(
    command: SimGetResourceCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetResourceCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetResource");
    unsimulated.refuseUnaccepted(input, ["restApiId", "resourceId", "embed"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const resourceId = unsimulated.require("resourceId", input.resourceId);
    const embed = simRestApiResourceEmbedOf("GetResource", input.embed);

    const restApi = this.access.api({
      method: "GET",
      restApiId,
      childPath: `${resourcesPath}/${resourceId}`,
      caller: options?.caller,
    });

    return {
      ...restApi.requireResource(resourceId).view(embed),
      $metadata: {},
    };
  }

  /**
   * Handle a GetResources command.
   */
  getResources(
    command: SimGetResourcesCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimGetResourcesCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("GetResources");
    unsimulated.refusePaging(input);
    unsimulated.refuseUnaccepted(input, ["restApiId", "embed"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const embed = simRestApiResourceEmbedOf("GetResources", input.embed);

    const restApi = this.access.api({
      method: "GET",
      restApiId,
      childPath: resourcesPath,
      caller: options?.caller,
    });

    return {
      items: restApi.resources.list().map((resource) => resource.view(embed)),
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteResource command.
   *
   * Everything under the resource goes with it, as it does on real AWS. The
   * root resource stays, because an API always has one.
   */
  deleteResource(
    command: SimDeleteResourceCommand,
    options?: SimApiGatewayRequestOptions,
  ): SimDeleteResourceCommandOutput {
    const { input } = command;
    const unsimulated = new SimApiGatewayUnsimulatedInput("DeleteResource");
    unsimulated.refuseUnaccepted(input, ["restApiId", "resourceId"]);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const resourceId = unsimulated.require("resourceId", input.resourceId);

    const restApi = this.access.api({
      method: "DELETE",
      restApiId,
      childPath: `${resourcesPath}/${resourceId}`,
      caller: options?.caller,
    });
    restApi.resources.remove(restApi.requireResource(resourceId));

    return { $metadata: {} };
  }
}
