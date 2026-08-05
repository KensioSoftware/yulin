import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../util/background/background.js";
import type { SimCfnServiceResourceFactory } from "./factory/sim-cfn-resource-factory.type.js";
import { SimCfnResourceCreateOperation } from "./create/sim-cfn-resource-create-operation.js";
import { SimCfnResourceCreationState } from "./state/sim-cfn-resource-creation-state.js";
import { SimCfnIgnoredProperties } from "./ignore/sim-cfn-ignored-properties.js";
import type {
  SimCfnIgnoredProperty,
  SimCfnPropertyIgnorer,
} from "./ignore/sim-cfn-ignored-property.type.js";
import { SimCfnResourceTemplateReader } from "./template/sim-cfn-resource-template-reader.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../template/value/sim-cfn-template-value.js";
import { SimCfnResourcePropertyResolver } from "./resolve/property/sim-cfn-resource-property-resolver.js";
import {
  type SimCfnResourceValueAdapter,
  simCfnResourceValueAdapter,
} from "./cfn/sim-cfn-resource-value-adapter.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import type {
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceProperties,
  SimCloudFormationResourceStatus,
} from "./sim-cfn-resource.type.js";

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
 * As a result, SimCfnResource acts as the stable Resource record passed between
 * stack creation, dependency resolution, and service-specific factories.
 */
export class SimCfnResource<
  T extends object = object,
> implements SimCfnPropertyIgnorer {
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly logicalId: string;
  /** The Stack this Resource belongs to, where a generated name comes from. */
  public readonly stackName: string | undefined;
  public readonly template: SimCfnTemplateValueRecord;
  private readonly creationState = new SimCfnResourceCreationState<T>();
  private readonly ignoredPropertyList = new SimCfnIgnoredProperties();
  private readonly resourceTemplateReader: SimCfnResourceTemplateReader;
  private readonly propertyResolver: SimCfnResourcePropertyResolver;
  private readonly background: BackgroundScheduler;
  private readonly cfnResourceFactory: SimCfnServiceResourceFactory | undefined;
  private readonly resourceLogicalIds: ReadonlySet<string>;

  constructor(properties: SimCloudFormationResourceProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      logicalId = "Resource",
      stackName,
      template = {},
      cfnResourceFactory,
      parameters,
      resourceLogicalIds = new Set(),
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.background = background;
    this.logicalId = logicalId;
    this.stackName = stackName;
    this.template = template;
    this.resourceTemplateReader = new SimCfnResourceTemplateReader(template);
    this.propertyResolver = new SimCfnResourcePropertyResolver({ parameters });
    this.cfnResourceFactory = cfnResourceFactory;
    this.resourceLogicalIds = resourceLogicalIds;
  }

  /**
   * Get the current CloudFormation creation status for this Resource.
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
   * Whether this Resource was skipped because sim CloudFormation does not yet
   * support creating its service or Resource type.
   */
  public get skipped(): boolean {
    return this.creationState.skipped;
  }

  /**
   * The reason this Resource was skipped, if it was skipped.
   */
  public get skippedReason(): string | undefined {
    return this.creationState.skippedReason;
  }

  /**
   * The properties this Resource was created without acting on.
   */
  public get ignoredProperties(): readonly SimCfnIgnoredProperty[] {
    return this.ignoredPropertyList.all;
  }

  /**
   * Record that this Resource is being created without acting on a property.
   * Called by the service parsing this Resource's properties, which is the
   * only thing that knows whether a property changes behaviour it simulates.
   */
  ignoreProperty(path: string, reason: string): void {
    this.ignoredPropertyList.record(this, path, reason);
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
  public get properties(): SimCfnTemplateValueRecord {
    return this.resourceTemplateReader.properties();
  }

  /**
   * The value returned when this Resource is referenced via { "Ref": logicalId }.
   *
   * Mirroring CloudFormation, Resource Ref behavior is Resource-type specific.
   * CloudFormation-specific value behavior is delegated to a Resource adapter so
   * simulated service objects do not need to know about CloudFormation.
   */
  public get refValue(): SimCfnTemplateValue {
    return this.cfnValueAdapter().refValue();
  }

  /**
   * The value returned when this Resource is referenced via Fn::GetAtt.
   *
   * Mirroring CloudFormation, Resource attributes are Resource-type specific.
   * CloudFormation-specific value behavior is delegated to a Resource adapter so
   * simulated service objects do not need to know about CloudFormation.
   */
  public attributeValue(attributeName: string): SimCfnTemplateValue {
    return this.cfnValueAdapter().attributeValue(attributeName);
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
   *
   * Includes both explicit DependsOn entries and implicit dependencies from Ref
   * expressions that target other Resources.
   */
  dependencies(): string[] {
    return this.resourceTemplateReader.dependencies(this.resourceLogicalIds);
  }

  /**
   * Resolve this Resource's Properties, including Refs to other Resources.
   *
   * Called by the creation operation once every dependency has reached
   * CREATE_COMPLETE, so referenced Resources have valid Ref values.
   */
  resolvedProperties(
    context: SimCloudFormationResourceCreateContext,
  ): SimCfnTemplateValueRecord {
    return this.propertyResolver.resolve(this.properties, context);
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
    const creationOperation = new SimCfnResourceCreateOperation({
      background: this.background,
      resource: this,
      cfnResourceFactory: this.cfnResourceFactory,
    });
    return creationOperation.run(context);
  }

  /**
   * Mark this Resource as creation in progress.
   *
   * Intended for use by the creation operation while it runs the simulated
   * CloudFormation lifecycle.
   */
  markCreateInProgress(): void {
    this.ignoredPropertyList.clear();
    this.creationState.markCreateInProgress();
  }

  /**
   * Mark this Resource as successfully created and store its simulated AWS
   * object. Intended for use by the creation operation after the appropriate
   * service-specific factory has created the simulated resource.
   */
  markCreateComplete(simResource?: T): void {
    this.creationState.markCreateComplete(simResource);
  }

  /**
   * Mark this Resource as skipped because sim CloudFormation does not yet
   * support creating its service or Resource type.
   *
   * Skipped Resources are treated as CREATE_COMPLETE so unsupported Resources do
   * not block local simulation of the rest of the Stack.
   */
  markCreateSkipped(reason: string): void {
    this.creationState.markCreateSkipped(reason);
  }

  /**
   * Mark this Resource as failed to create and store the failure reason.
   * Intended for use by the creation operation when service-specific creation
   * throws or rejects.
   */
  markCreateFailed(error?: Error): void {
    this.creationState.markCreateFailed(error);
  }

  private cfnValueAdapter(): SimCfnResourceValueAdapter {
    return simCfnResourceValueAdapter({
      logicalId: this.logicalId,
      type: this.type,
      simResource: this.simResource,
    });
  }
}

export {
  type SimCloudFormationResourceCreateContext,
  type SimCloudFormationResourceProperties,
  type SimCloudFormationResourceStatus,
} from "./sim-cfn-resource.type.js";
