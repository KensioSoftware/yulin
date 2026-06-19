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
import { SimCfnResourceCreateOperation } from "./create/sim-cfn-resource-create-operation.js";
import { SimCfnResourceCreationState } from "./state/sim-cfn-resource-creation-state.js";
import { SimCfnResourceTemplateReader } from "./template/sim-cfn-resource-template-reader.js";

interface SimCloudFormationResourceProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
  readonly logicalId?: string;
  readonly template?: Record<string, unknown>;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
}

/**
 * Simulated CloudFormation Resource status.
 *
 * These states model the CloudFormation creation lifecycle for one Resource
 * entry, not the lifecycle of the underlying simulated AWS service object.
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
 * Runtime representation of one CloudFormation Resource entry.
 *
 * A SimCfnResource is created from one item in a stack template's Resources map.
 * It keeps the Resource logical ID, account/region scope, original Resource
 * template object, CloudFormation creation state, and the simulated AWS object
 * produced by Resource creation.
 *
 * This class stays small:
 * - whole-template validation and Parameter resolution belong to SimCfnTemplate;
 * - Resource-field reading belongs to SimCfnResourceTemplateReader;
 * - asynchronous creation orchestration belongs to SimCfnResourceCreateOperation;
 * - service-specific object construction belongs to SimCfnServiceResourceFactory.
 *
 * As a result, SimCfnResource acts as the stable Resource record passed between
 * stack creation, dependency resolution, and service-specific factories.
 */
export class SimCfnResource<T extends object = object> {
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly logicalId: string;
  public readonly template: Record<string, unknown>;
  private readonly creationState = new SimCfnResourceCreationState<T>();
  private readonly resourceTemplateReader: SimCfnResourceTemplateReader;
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
    this.resourceTemplateReader = new SimCfnResourceTemplateReader(template);
    this.cfnResourceFactory = cfnResourceFactory;
  }

  /**
   * Get the current CloudFormation creation status for this Resource.
   */
  public get status(): SimCloudFormationResourceStatus {
    return this.creationState.status;
  }

  /**
   * Whether this Resource has successfully created its simulated AWS object.
   */
  public get deployed(): boolean {
    return this.creationState.deployed;
  }

  /**
   * Whether this Resource has reached a terminal successful creation status.
   */
  public get createComplete(): boolean {
    return this.creationState.createComplete;
  }

  /**
   * The CloudFormation Resource type from the Resource template.
   *
   * E.g. AWS::S3::Bucket
   */
  public get type(): string | undefined {
    return this.resourceTemplateReader.type();
  }

  /**
   * The CloudFormation Resource properties object from the Resource template.
   *
   * Missing or non-object Properties are treated as an empty object by the
   * Resource template reader.
   */
  public get properties(): Record<string, unknown> {
    return this.resourceTemplateReader.properties();
  }

  /**
   * The simulated AWS object created for this CloudFormation Resource.
   *
   * For example, an AWS::S3::Bucket Resource may point at a simulated S3 Bucket
   * after creation completes. Resources that do not produce a concrete service
   * object may leave this undefined.
   */
  public get simResource(): T | undefined {
    return this.creationState.simResource;
  }

  /**
   * The creation failure captured for this Resource, if creation failed.
   */
  public get error(): Error | undefined {
    return this.creationState.error;
  }

  /**
   * Logical IDs of Resources that must complete before this Resource can
   * create.
   */
  dependencies(): string[] {
    return this.resourceTemplateReader.dependencies();
  }

  /**
   * Whether every declared dependency has reached CREATE_COMPLETE.
   *
   * Missing dependencies are treated as not ready because they cannot report a
   * successful creation status.
   */
  canCreate(resources: ReadonlyMap<string, SimCfnResource>): boolean {
    return this.dependencies().every((dependency) => {
      return resources.get(dependency)?.status === "CREATE_COMPLETE";
    });
  }

  /**
   * Start creating this Resource into simulated AWS.
   *
   * The actual work is delegated to SimCfnResourceCreateOperation so this class
   * remains a lifecycle record rather than an async workflow implementation.
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
   *
   * Intended for use by the creation operation while it runs the simulated
   * CloudFormation lifecycle.
   */
  markCreateInProgress(): void {
    this.creationState.markCreateInProgress();
  }

  /**
   * Mark this Resource as successfully created and store its simulated AWS object.
   *
   * Intended for use by the creation operation after the appropriate
   * service-specific factory has created the simulated resource.
   */
  markCreateComplete(simResource?: T): void {
    this.creationState.markCreateComplete(simResource);
  }

  /**
   * Mark this Resource as failed to create and store the failure reason.
   *
   * Intended for use by the creation operation when service-specific creation
   * throws or rejects.
   */
  markCreateFailed(error?: Error): void {
    this.creationState.markCreateFailed(error);
  }
}
