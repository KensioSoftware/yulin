import { SimApiGatewayConflict } from "../../error/sim-api-gateway.error.js";
import type { SimRestApiPathPart } from "./sim-rest-api-path-part.js";
import {
  makeSimRestApiResourceId,
  type SimRestApiResourceId,
} from "./sim-rest-api-resource-id.js";
import {
  SimRestApiResource,
  simRestApiRootPath,
} from "./sim-rest-api-resource.js";

/**
 * The path tree of one REST API, keyed by resource id.
 *
 * The tree is held flat and each resource names its parent, which is how the
 * REST API addresses one: `GetResource` takes a resource id and nothing else,
 * and `CreateResource` names its parent by id. Walking a request path is a
 * matter of following parent ids, and it belongs to the serving layer.
 */
export class SimRestApiResourceStore {
  /**
   * The root resource, which every API is created with and which cannot be
   * deleted.
   */
  public readonly root: SimRestApiResource;

  private readonly resources = new Map<
    SimRestApiResourceId,
    SimRestApiResource
  >();

  constructor() {
    this.root = new SimRestApiResource({
      resourceId: makeSimRestApiResourceId(),
      path: simRestApiRootPath,
    });
    this.resources.set(this.root.resourceId, this.root);
  }

  /**
   * Add a path part under a parent, refusing a part the parent already has.
   */
  addChild(
    parent: SimRestApiResource,
    pathPart: SimRestApiPathPart,
  ): SimRestApiResource {
    const path = this.childPath(parent, pathPart);

    if (this.findByPath(path) !== undefined) {
      throw new SimApiGatewayConflict(
        `Another resource with the same parent already has this name: ${pathPart.pathPart}`,
      );
    }

    const resource = new SimRestApiResource({
      resourceId: makeSimRestApiResourceId(),
      parentId: parent.resourceId,
      pathPart,
      path,
    });
    this.resources.set(resource.resourceId, resource);

    return resource;
  }

  /**
   * Find a resource by id.
   */
  find(resourceId: string): SimRestApiResource | undefined {
    return this.resources.get(resourceId as SimRestApiResourceId);
  }

  /**
   * Find a resource by its full path.
   */
  findByPath(path: string): SimRestApiResource | undefined {
    return this.list().find((resource) => resource.path === path);
  }

  /**
   * The resources directly under a parent.
   */
  children(parentId: SimRestApiResourceId): SimRestApiResource[] {
    return this.list().filter((resource) => resource.parentId === parentId);
  }

  /**
   * Forget a resource and everything under it, as DeleteResource does.
   *
   * Real API Gateway deletes the subtree with the resource rather than
   * refusing while children remain, so a caller tearing a path down names only
   * the top of it.
   */
  remove(resource: SimRestApiResource): void {
    for (const child of this.children(resource.resourceId)) {
      this.remove(child);
    }

    this.resources.delete(resource.resourceId);
  }

  /**
   * Every resource of this API, the root first.
   */
  list(): SimRestApiResource[] {
    return this.resources.values().toArray();
  }

  /**
   * The full path a part gets under a parent. The root's own path is the
   * separator, so a part under it takes no second one.
   */
  private childPath(
    parent: SimRestApiResource,
    pathPart: SimRestApiPathPart,
  ): string {
    return parent.path === simRestApiRootPath
      ? `${simRestApiRootPath}${pathPart.pathPart}`
      : `${parent.path}/${pathPart.pathPart}`;
  }
}
