import { SimApiGatewayConflict } from "../../error/sim-api-gateway.error.js";
import type {
  SimRestApiMethod,
  SimRestApiMethodView,
} from "../method/sim-rest-api-method.js";
import type { SimRestApiPathPart } from "./sim-rest-api-path-part.js";
import type { SimRestApiResourceId } from "./sim-rest-api-resource-id.js";

/**
 * The path of the root resource, which every API is created with.
 */
export const simRestApiRootPath = "/";

interface SimRestApiResourceProperties {
  readonly resourceId: SimRestApiResourceId;
  readonly parentId?: SimRestApiResourceId | undefined;
  readonly pathPart?: SimRestApiPathPart | undefined;
  readonly path: string;
}

/**
 * Minimal structural resource view, as the Create and Get commands return.
 */
export interface SimRestApiResourceView {
  id: string;
  path: string;
  parentId?: string;
  pathPart?: string;
  resourceMethods?: Record<string, SimRestApiMethodView>;
}

/**
 * A simulated REST API resource: one node of the API's path tree.
 *
 * The root resource carries no parent and no path part, and every other
 * resource is a path part under a parent. A resource owns the methods declared
 * on it, keyed by HTTP method, because a method is addressed by resource id
 * and HTTP method on real AWS and none of them outlives its resource.
 */
export class SimRestApiResource {
  public readonly resourceId: SimRestApiResourceId;
  public readonly parentId?: SimRestApiResourceId | undefined;
  public readonly pathPart?: SimRestApiPathPart | undefined;
  public readonly path: string;

  private readonly methods = new Map<string, SimRestApiMethod>();

  constructor(properties: SimRestApiResourceProperties) {
    this.resourceId = properties.resourceId;
    this.parentId = properties.parentId;
    this.pathPart = properties.pathPart;
    this.path = properties.path;
  }

  /**
   * Whether this resource captures the rest of the path, which is what a
   * `{proxy+}` part does. Such a resource takes no children, since nothing can
   * follow a segment that has already matched everything left.
   */
  get greedy(): boolean {
    return this.pathPart?.greedy ?? false;
  }

  /**
   * Declare a method on this resource, refusing one already declared.
   */
  addMethod(method: SimRestApiMethod): void {
    if (this.methods.has(method.httpMethod)) {
      throw new SimApiGatewayConflict(
        `Method ${method.httpMethod} already exists on resource ${this.path}`,
      );
    }

    this.methods.set(method.httpMethod, method);
  }

  /**
   * Find a method declared on this resource by HTTP method.
   */
  findMethod(httpMethod: string): SimRestApiMethod | undefined {
    return this.methods.get(httpMethod);
  }

  /**
   * Forget a method, as DeleteMethod does. Its integration goes with it,
   * because the integration belongs to the method.
   */
  removeMethod(httpMethod: string): void {
    this.methods.delete(httpMethod);
  }

  /**
   * Every method declared on this resource.
   */
  listMethods(): SimRestApiMethod[] {
    return this.methods.values().toArray();
  }

  /**
   * Get the AWS-like view of this resource.
   *
   * The methods are left out unless they were asked for, which is what the
   * `embed` option of `GetResource` and `GetResources` decides. Real API
   * Gateway omits them by default, and a caller reading them from an
   * unembedded response would be reading something AWS never sends.
   */
  view(options: { readonly methods?: boolean } = {}): SimRestApiResourceView {
    const view: SimRestApiResourceView = {
      id: this.resourceId,
      path: this.path,
    };

    if (this.parentId !== undefined) {
      view.parentId = this.parentId;
    }

    if (this.pathPart !== undefined) {
      view.pathPart = this.pathPart.pathPart;
    }

    if (options.methods === true && this.methods.size > 0) {
      view.resourceMethods = Object.fromEntries(
        this.listMethods().map((method) => [method.httpMethod, method.view()]),
      );
    }

    return view;
  }
}
