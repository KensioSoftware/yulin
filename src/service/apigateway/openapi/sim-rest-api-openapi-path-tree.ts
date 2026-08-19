import { simRestApiRootPath } from "../api/resource/sim-rest-api-resource.js";
import type { SimRestApiResourceCommands } from "../command/resource/sim-rest-api-resource-commands.js";
import type { SimRestApiOpenApiCommand } from "./sim-rest-api-openapi-command.js";
import type { SimRestApiOpenApiPathItem } from "./sim-rest-api-openapi-path-item.js";

interface SimRestApiOpenApiPathTreeProperties {
  readonly restApiId: string;
  readonly rootResourceId: string;
  readonly resourceCommands: SimRestApiResourceCommands;
  readonly command: SimRestApiOpenApiCommand;
}

/**
 * Builds the path tree one document declares, one resource per segment.
 *
 * A REST API holds a path as a tree of resources rather than as the whole
 * string, so `/pets` and `/pets/{petId}` share the `pets` node. Each node
 * created is remembered under its full path, which is what lets the second
 * path find the first one's node whichever order the document wrote them in.
 *
 * This is per-import, because the paths of one document build one tree.
 */
export class SimRestApiOpenApiPathTree {
  private readonly restApiId: string;
  private readonly rootResourceId: string;
  private readonly resourceCommands: SimRestApiResourceCommands;
  private readonly command: SimRestApiOpenApiCommand;
  private readonly resourceIds = new Map<string, string>();

  constructor(properties: SimRestApiOpenApiPathTreeProperties) {
    this.restApiId = properties.restApiId;
    this.rootResourceId = properties.rootResourceId;
    this.resourceCommands = properties.resourceCommands;
    this.command = properties.command;
  }

  /**
   * The resource one path is served by, creating the nodes it needs.
   */
  resourceIdFor(item: SimRestApiOpenApiPathItem): string {
    let resourceId = this.rootResourceId;
    let path = "";

    for (const segment of item.segments()) {
      path += `${simRestApiRootPath}${segment}`;
      resourceId = this.node(item, path, resourceId, segment);
    }

    return resourceId;
  }

  /**
   * The resource at one path, created under its parent unless this import
   * already created it for an earlier path.
   */
  private node(
    item: SimRestApiOpenApiPathItem,
    path: string,
    parentId: string,
    pathPart: string,
  ): string {
    const known = this.resourceIds.get(path);

    if (known !== undefined) {
      return known;
    }

    const created = this.command.run(item.pointer(), () =>
      this.resourceCommands.createResource({
        input: { restApiId: this.restApiId, parentId, pathPart },
      }),
    );
    this.resourceIds.set(path, created.id);

    return created.id;
  }
}
