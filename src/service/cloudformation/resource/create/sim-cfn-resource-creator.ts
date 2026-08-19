import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";
import { parseSimCloudFormationResourceType } from "../parser/sim-cfn-resource-parser.js";
import { resolveSimCloudFormationServiceResourceFactory } from "../resolve/service/sim-cfn-service-resolver.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface SimCfnResourceCreatorProperties<T extends object> {
  readonly resource: SimCfnResource<T>;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
}

/**
 * Creates the underlying simulated AWS service Resource for a CloudFormation
 * Resource.
 *
 * This class owns the service-facing creation details: validating and parsing
 * the CloudFormation Resource type, resolving the appropriate service Resource
 * factory, resolving CloudFormation properties, and invoking the factory.
 *
 * It does not manage the asynchronous CloudFormation operation lifecycle.
 * Background scheduling, Resource state transitions, and failure handling
 * belong to SimCfnResourceCreateOperation.
 */
export class SimCfnResourceCreator<T extends object = object> {
  private readonly resource: SimCfnResource<T>;
  private readonly cfnResourceFactory: SimCfnServiceResourceFactory | undefined;

  constructor(properties: SimCfnResourceCreatorProperties<T>) {
    this.resource = properties.resource;
    this.cfnResourceFactory = properties.cfnResourceFactory;
  }

  /**
   * Create the underlying simulated AWS service Resource.
   *
   * The supplied context is enriched with properties resolved from the
   * CloudFormation Resource before it is passed to the service Resource
   * factory.
   * A factory supplied in the constructor is used directly; otherwise the
   * factory is resolved from the Resource type and target account/Region scope.
   */
  async create(
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const { type } = this.resource;
    assertDefined(
      type,
      `Sim CloudFormation Resource ${this.resource.logicalId} is missing a Type`,
    );

    const resourceType = parseSimCloudFormationResourceType(type);
    const factory =
      this.cfnResourceFactory ??
      resolveSimCloudFormationServiceResourceFactory(
        context.simAws,
        this.resource.accountRegionScope,
        resourceType,
      );

    const resolvedContext: SimCloudFormationResourceCreateContext = {
      ...context,
      resolvedProperties: await this.resource.resolvedProperties(context),
    };

    return await factory.create(
      resourceType.resourceTypeName,
      this.resource,
      resolvedContext,
    );
  }
}
