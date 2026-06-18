import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimCfnServiceResourceFactory } from "./factory/sim-cfn-resource-factory.type.js";
import { parseSimCloudFormationResourceType } from "./parser/sim-cfn-resource-parser.js";
import { resolveSimCloudFormationServiceResourceFactory } from "./resolver/sim-cfn-service-resolver.js";

interface SimCloudFormationResourceProps<T extends object = object> {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly logicalId: string;
  readonly template: Record<string, unknown>;
  readonly simResource?: T | undefined;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
}

/**
 * Simulated CloudFormation Resource status.
 */
export type SimCloudFormationResourceStatus =
  | "CREATE_PENDING"
  | "CREATE_IN_PROGRESS"
  | "CREATE_COMPLETE"
  | "CREATE_FAILED";

export interface SimCloudFormationResourceCreateContext {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
}

/**
 * Lightweight simulated CloudFormation Resource record.
 *
 * This represents a Resource entry from a CloudFormation template and can point
 * at the actual simulated AWS resource created from it, such as a SimS3Bucket.
 */
export class SimCfnResource<T extends object = object> {
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly logicalId: string;
  public readonly template: Record<string, unknown>;
  private _status: SimCloudFormationResourceStatus = "CREATE_PENDING";
  private _simResource: T | undefined;
  private deployError: Error | undefined;
  private readonly cfnResourceFactory: SimCfnServiceResourceFactory | undefined;

  constructor(props: SimCloudFormationResourceProps<T>) {
    const {
      accountRegionScope,
      logicalId,
      template,
      simResource,
      cfnResourceFactory,
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.logicalId = logicalId;
    this.template = template;
    this._simResource = simResource;
    this.cfnResourceFactory = cfnResourceFactory;
  }

  /**
   * Get the current Resource status.
   */
  public get status(): SimCloudFormationResourceStatus {
    return this._status;
  }

  /**
   * Whether this Resource has been deployed into simulated AWS.
   */
  public get deployed(): boolean {
    return this._status === "CREATE_COMPLETE";
  }

  /**
   * Whether this Resource has reached a terminal creation status.
   */
  public get createComplete(): boolean {
    return (
      this._status === "CREATE_COMPLETE" || this._status === "CREATE_FAILED"
    );
  }

  /**
   * The CloudFormation Resource type.
   */
  public get type(): string | undefined {
    const type = this.template["Type"];
    return typeof type === "string" ? type : undefined;
  }

  /**
   * The CloudFormation Resource properties.
   */
  public get properties(): Record<string, unknown> {
    const properties = this.template["Properties"];

    if (isRecord(properties)) {
      return properties;
    }

    return {};
  }

  /**
   * The simulated AWS resource represented by this CloudFormation Resource.
   */
  public get simResource(): T | undefined {
    return this._simResource;
  }

  /**
   * Get the deployment error, if Resource creation failed.
   */
  public get error(): Error | undefined {
    return this.deployError;
  }

  /**
   * Return logical IDs this Resource depends on.
   */
  dependencies(): string[] {
    const dependsOn = this.template["DependsOn"];

    if (typeof dependsOn === "string") {
      return [dependsOn];
    }

    if (Array.isArray(dependsOn)) {
      return dependsOn.filter((dependency): dependency is string => {
        return typeof dependency === "string";
      });
    }

    return [];
  }

  /**
   * Whether this Resource can be created based on Resource dependency status.
   */
  canCreate(resources: ReadonlyMap<string, SimCfnResource>): boolean {
    return this.dependencies().every((dependency) => {
      return resources.get(dependency)?.status === "CREATE_COMPLETE";
    });
  }

  /**
   * Create this Resource into simulated AWS as a background operation.
   */
  create(context: SimCloudFormationResourceCreateContext): Promise<void> {
    this.markCreateInProgress();

    return new Promise<void>((resolve, reject) => {
      context.background.schedule(async () => {
        try {
          await context.background.sequence();

          const simResource = await this.createSimResource(context);
          this.markCreateComplete(simResource as T | undefined);
          resolve();
        } catch (error) {
          const resourceError =
            error instanceof Error
              ? error
              : new Error(
                  `Sim CloudFormation Resource creation failed: ${String(error)}`,
                );

          this.markCreateFailed(resourceError);
          reject(resourceError);
        }
      });
    });
  }

  /**
   * Mark this Resource as creation in progress.
   */
  markCreateInProgress(): void {
    this.deployError = undefined;
    this._status = "CREATE_IN_PROGRESS";
  }

  /**
   * Mark this Resource as successfully created.
   */
  markCreateComplete(simResource?: T): void {
    if (simResource !== undefined) {
      this._simResource = simResource;
    }

    this.deployError = undefined;
    this._status = "CREATE_COMPLETE";
  }

  /**
   * Mark this Resource as failed to create.
   */
  markCreateFailed(error?: Error): void {
    this.deployError = error;
    this._status = "CREATE_FAILED";
  }

  private async createSimResource(
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const { type } = this;

    if (type === undefined) {
      throw new Error(
        `Sim CloudFormation Resource ${this.logicalId} is missing a Type`,
      );
    }

    const resourceType = parseSimCloudFormationResourceType(type);
    const factory =
      this.cfnResourceFactory ??
      resolveSimCloudFormationServiceResourceFactory(
        context.simAws,
        this.accountRegionScope,
        resourceType,
      );

    return await factory.create(resourceType.resourceTypeName, this, context);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
