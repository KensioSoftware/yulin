import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";
import { parseSimCloudFormationResourceType } from "../parser/sim-cfn-resource-parser.js";
import { resolveSimCloudFormationServiceResourceFactory } from "../resolver/sim-cfn-service-resolver.js";

interface SimCfnResourceCreateOperationProps<T extends object> {
  readonly background: BackgroundScheduler;
  readonly resource: SimCfnResource<T>;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
}

/**
 * Runs the asynchronous CloudFormation Resource creation lifecycle.
 */
export class SimCfnResourceCreateOperation<T extends object = object> {
  private readonly background: BackgroundScheduler;
  private readonly resource: SimCfnResource<T>;
  private readonly cfnResourceFactory: SimCfnServiceResourceFactory | undefined;

  constructor(props: SimCfnResourceCreateOperationProps<T>) {
    this.background = props.background;
    this.resource = props.resource;
    this.cfnResourceFactory = props.cfnResourceFactory;
  }

  /**
   * Create the Resource into simulated AWS as a background operation.
   */
  run(context: SimCloudFormationResourceCreateContext): Promise<void> {
    this.resource.markCreateInProgress();

    return new Promise<void>((resolve, reject) => {
      this.background.schedule(async () => {
        try {
          await this.background.sequence();

          const simResource = await this.createSimResource(context);
          this.resource.markCreateComplete(simResource as T | undefined);
          resolve();
        } catch (error) {
          const resourceError = this.resourceCreationError(error);

          this.resource.markCreateFailed(resourceError);
          reject(resourceError);
        }
      });
    });
  }

  private async createSimResource(
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const { type } = this.resource;

    if (type === undefined) {
      throw new Error(
        `Sim CloudFormation Resource ${this.resource.logicalId} is missing a Type`,
      );
    }

    const resourceType = parseSimCloudFormationResourceType(type);
    const factory =
      this.cfnResourceFactory ??
      resolveSimCloudFormationServiceResourceFactory(
        context.simAws,
        this.resource.accountRegionScope,
        resourceType,
      );

    return await factory.create(
      resourceType.resourceTypeName,
      this.resource,
      context,
    );
  }

  private resourceCreationError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(
      `Sim CloudFormation Resource ${this.resource.logicalId} creation failed: ${String(error)}`,
    );
  }
}
