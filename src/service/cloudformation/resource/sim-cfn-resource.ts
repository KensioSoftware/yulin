import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../util/background/background.js";
import type { SimCfnServiceResourceFactory } from "./factory/sim-cfn-resource-factory.type.js";
import { SimCfnResourceCreateOperation } from "./create/sim-cfn-resource-create-operation.js";
import { SimCfnResourceDeleteOperation } from "./delete/sim-cfn-resource-delete-operation.js";
import { SimCfnResourceCreationState } from "./state/sim-cfn-resource-creation-state.js";
import { SimCfnResourceDeletionState } from "./state/sim-cfn-resource-deletion-state.js";
import { SimCfnResourceRecord } from "./sim-cfn-resource-record.js";
import type {
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
  SimCloudFormationResourceProperties,
  SimCloudFormationResourceStatus,
} from "./sim-cfn-resource.type.js";

/**
 * Runtime representation of one CloudFormation Resource entry.
 *
 * A SimCfnResource is created from one item in a stack template's Resources map.
 * It keeps the Resource logical ID, account/region scope, original Resource
 * template object, CloudFormation lifecycle state, and the simulated AWS object
 * produced by Resource creation.
 *
 * This class stays small:
 * - what the Resource is, rather than what has happened to it, belongs to
 *   SimCfnResourceRecord, which this extends;
 * - whole-template validation and Parameter resolution belong to SimCfnTemplate;
 * - asynchronous creation and deletion orchestration belong to
 *   SimCfnResourceCreateOperation and SimCfnResourceDeleteOperation;
 * - service-specific object construction and removal belong to
 *   SimCfnServiceResourceFactory.
 * As a result, SimCfnResource acts as the stable Resource record passed between
 * stack deployment, dependency resolution, and service-specific factories.
 */
export class SimCfnResource<
  T extends object = object,
> extends SimCfnResourceRecord {
  private readonly creationState = new SimCfnResourceCreationState<T>();
  private readonly deletionState = new SimCfnResourceDeletionState();
  private readonly background: BackgroundScheduler;
  private readonly cfnResourceFactory: SimCfnServiceResourceFactory | undefined;

  constructor(properties: SimCloudFormationResourceProperties = {}) {
    super(properties);

    const { background = new BackgroundTasks(), cfnResourceFactory } =
      properties;

    this.background = background;
    this.cfnResourceFactory = cfnResourceFactory;
  }

  /**
   * Get the current CloudFormation status for this Resource.
   *
   * A Resource keeps the status its creation left it with until the Stack asks
   * for it to be deleted, so the status reads as the last thing CloudFormation
   * did to the Resource.
   */
  public get status(): SimCloudFormationResourceStatus {
    return this.deletionState.status ?? this.creationState.status;
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
   * Whether this Resource has reached a terminal successful creation status.
   */
  public get createComplete(): boolean {
    return this.creationState.createComplete;
  }

  /**
   * Whether this Resource has reached a terminal deletion status.
   */
  public get deleteComplete(): boolean {
    return this.deletionState.deleteComplete;
  }

  /**
   * Whether this Resource was removed from simulated AWS.
   */
  public get deleted(): boolean {
    return this.deletionState.deleted;
  }

  /**
   * Whether this Resource's deletion was recorded rather than carried out,
   * because sim CloudFormation has no way to delete its Resource type.
   */
  public get deletionSkipped(): boolean {
    return this.deletionState.skipped;
  }

  /**
   * The reason this Resource's deletion was skipped, if it was skipped.
   */
  public get deletionSkippedReason(): string | undefined {
    return this.deletionState.skippedReason;
  }

  /**
   * The simulated AWS object created for this CloudFormation Resource.
   *
   * For example, an AWS::S3::Bucket Resource may point at a simulated S3 Bucket
   * after creation completes. Resources that do not produce a concrete service
   * object may leave this undefined.
   */
  public override get simResource(): T | undefined {
    return this.creationState.simResource;
  }

  /**
   * The failure captured for this Resource, if creation or deletion failed.
   */
  public get error(): Error | undefined {
    return this.deletionState.error ?? this.creationState.error;
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
   * Whether this Resource was left in simulated AWS by a Stack teardown,
   * because its DeletionPolicy says to keep it.
   */
  public get retained(): boolean {
    return this.deletionState.retained;
  }

  /**
   * Start deleting this Resource from simulated AWS.
   *
   * A Resource whose DeletionPolicy retains it never reaches the delete
   * operation. CloudFormation leaves it where it is and reports it as
   * DELETE_SKIPPED, so the Stack can finish deleting around it.
   *
   * The actual work is delegated to SimCfnResourceDeleteOperation, for the same
   * reason creation is.
   */
  delete(context: SimCloudFormationResourceDeleteContext): Promise<void> {
    if (this.retainedOnDelete) {
      this.deletionState.markDeleteRetained();

      return Promise.resolve();
    }

    return new SimCfnResourceDeleteOperation({
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
    this.clearIgnoredProperties();
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

  /**
   * Mark this Resource as deletion in progress.
   */
  markDeleteInProgress(): void {
    this.deletionState.markDeleteInProgress();
  }

  /**
   * Mark this Resource as successfully deleted.
   */
  markDeleteComplete(): void {
    this.deletionState.markDeleteComplete();
  }

  /**
   * Mark this Resource's deletion as skipped because sim CloudFormation has no
   * way to delete its service or Resource type.
   */
  markDeleteSkipped(reason: string): void {
    this.deletionState.markDeleteSkipped(reason);
  }

  /**
   * Mark this Resource as failed to delete and store the failure reason.
   */
  markDeleteFailed(error?: Error): void {
    this.deletionState.markDeleteFailed(error);
  }
}

export {
  type SimCloudFormationResourceCreateContext,
  type SimCloudFormationResourceDeleteContext,
  type SimCloudFormationResourceProperties,
  type SimCloudFormationResourceStatus,
} from "./sim-cfn-resource.type.js";
