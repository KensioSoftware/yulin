import type { SimAws } from "../../aws/sim-aws.js";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../../aws/sim-aws-account-region-scope.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../util/background/background.js";
import type { SimCfnServiceResourceFactory } from "./factory/sim-cfn-resource-factory.type.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { parseSimCfnResourceDependencies } from "./dependency/sim-cfn-resource-dependencies.js";
import { SimCfnResourceCreateOperation } from "./create/sim-cfn-resource-create-operation.js";
import { SimCfnResourceCreationState } from "./state/sim-cfn-resource-creation-state.js";

interface SimCloudFormationResourceProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
  readonly logicalId?: string;
  readonly template?: Record<string, unknown>;
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
  private readonly creationState = new SimCfnResourceCreationState<T>();
  private readonly background: BackgroundScheduler;
  private readonly cfnResourceFactory: SimCfnServiceResourceFactory | undefined;

  constructor(props: SimCloudFormationResourceProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      logicalId = "Resource",
      template = {},
      cfnResourceFactory,
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.background = background;
    this.logicalId = logicalId;
    this.template = template;
    this.cfnResourceFactory = cfnResourceFactory;
  }

  /**
   * Get the current Resource status.
   */
  public get status(): SimCloudFormationResourceStatus {
    return this.creationState.status;
  }

  /**
   * Whether this Resource has been deployed into simulated AWS.
   */
  public get deployed(): boolean {
    return this.creationState.deployed;
  }

  /**
   * Whether this Resource has reached a terminal creation status.
   */
  public get createComplete(): boolean {
    return this.creationState.createComplete;
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
    return this.creationState.simResource;
  }

  /**
   * Get the deployment error, if Resource creation failed.
   */
  public get error(): Error | undefined {
    return this.creationState.error;
  }

  /**
   * Return logical IDs this Resource depends on.
   */
  dependencies(): string[] {
    return parseSimCfnResourceDependencies(this.template["DependsOn"]);
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
    return new SimCfnResourceCreateOperation({
      background: this.background,
      resource: this,
      cfnResourceFactory: this.cfnResourceFactory,
    }).run(context);
  }

  /**
   * Mark this Resource as creation in progress.
   */
  markCreateInProgress(): void {
    this.creationState.markCreateInProgress();
  }

  /**
   * Mark this Resource as successfully created.
   */
  markCreateComplete(simResource?: T): void {
    this.creationState.markCreateComplete(simResource);
  }

  /**
   * Mark this Resource as failed to create.
   */
  markCreateFailed(error?: Error): void {
    this.creationState.markCreateFailed(error);
  }
}
