import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnBinding } from "../bind/sim-cfn-binding.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import {
  SimCfnStackDeployContext,
  type SimCfnStackUpdateContext,
} from "./sim-cfn-stack-deploy-context.js";
import { SimCdkAssetsPublisher } from "../cdk/assets/sim-cdk-assets-publisher.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import { SimCfnResourceRetention } from "../resource/delete/sim-cfn-resource-retention.js";
import { simCfnStackRetainedLogicalIds } from "./teardown/sim-cfn-stack-retained-logical-ids.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import { SimCfnStackResourceCreator } from "./deploy/sim-cfn-stack-resource-creator.js";
import type { SimCfnResourceOrder } from "./deploy/sim-cfn-resource-order.js";
import { SimCfnStackResourceDeleter } from "./teardown/sim-cfn-stack-resource-deleter.js";
import { SimCfnStackUpdater } from "./update/sim-cfn-stack-updater.js";
import type { SimCfnStackResourceReplacement } from "./update/sim-cfn-stack-update-plan.js";
import { SimCfnResourceUpdateValidator } from "../resource/update/sim-cfn-resource-update-validator.js";
import type { SimCloudFormationStackName } from "./sim-cfn-stack.js";

interface SimCfnStackUpdateProperties {
  readonly background: BackgroundScheduler;
  readonly resources: Map<string, SimCfnResource>;
  readonly current: SimCfnTemplate;
  readonly updated: SimCfnTemplate;
}

interface SimCfnStackResourceOperationsProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stackName: SimCloudFormationStackName;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;

  /**
   * The principal the Stack's Resource work is authorized as. An omitted
   * caller leaves each service to decide the request as the Account root.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * The principal the Stack's CDK file assets are published as, where that is
   * somebody other than the caller its Resources are created as.
   */
  readonly assetsCaller?: SimAwsCaller | undefined;

  /**
   * The order Resources with no dependency between them are started in.
   */
  readonly resourceOrder?: SimCfnResourceOrder | undefined;
}

/**
 * What a Stack can ask simulated AWS to do with its Resources.
 *
 * Deploying, updating and tearing down all create or delete Resources against
 * the same simulated AWS, in the same Stack scope, so the scope is held here
 * once rather than assembled at each of them. Creating also publishes the CDK
 * cloud assembly assets first, as a real `cdk deploy` publishes them before
 * CloudFormation processes the template that references them.
 *
 * It does not own Stack status or decide what an update changes.
 * SimCfnStackResourceCreator and SimCfnStackResourceDeleter own the dependency
 * ordering of the work itself.
 */
export class SimCfnStackResourceOperations {
  private readonly simAws: SimAws;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly stackName: SimCloudFormationStackName;
  private readonly bindings: readonly SimCfnBinding[] | undefined;
  private readonly resourceOrder: SimCfnResourceOrder | undefined;
  private readonly context: SimCfnStackDeployContext;

  /**
   * Resources an update kept in simulated AWS.
   *
   * They are held here because the Stack cannot hold them. A replaced Resource
   * gives its logical ID up to the Resource created in its place as soon as the
   * update applies. A teardown's retained Resources are still on the Stack, and
   * are read off it.
   */
  private readonly retainedByUpdates: SimCfnResource[] = [];

  constructor(properties: SimCfnStackResourceOperationsProperties) {
    const { simAws, accountRegionScope, stackName, bindings, resourceOrder } =
      properties;

    this.simAws = simAws;
    this.accountRegionScope = accountRegionScope;
    this.stackName = stackName;
    this.bindings = bindings;
    this.resourceOrder = resourceOrder;
    this.context = new SimCfnStackDeployContext(properties);
  }

  /** Take on what an update brings with it, for every later operation. */
  useUpdate(properties: SimCfnStackUpdateContext): void {
    this.context.useUpdate(properties);
  }

  /**
   * Create every Resource in the given Stack Resource map.
   */
  async createAll(
    resources: ReadonlyMap<string, SimCfnResource>,
  ): Promise<void> {
    await this.publishAssets();
    await this.creator(resources).createAll();
  }

  /**
   * Create the given Resources, in dependency order among the whole Stack.
   */
  async create(
    resources: ReadonlyMap<string, SimCfnResource>,
    creating: readonly SimCfnResource[],
  ): Promise<void> {
    await this.publishAssets();
    await this.creator(resources).create(creating);
  }

  /** Resources an update kept in simulated AWS. */
  public get retainedResources(): readonly SimCfnResource[] {
    return this.retainedByUpdates;
  }

  /**
   * Refuse a teardown that names a Resource the Stack does not have, before
   * anything is deleted.
   */
  assertRetainable(
    resources: ReadonlyMap<string, SimCfnResource>,
    retainResources: readonly string[] | undefined,
  ): void {
    this.teardownRetention(resources, retainResources);
  }

  /**
   * Delete every Resource in the given Stack Resource map, apart from any the
   * teardown named as ones to keep.
   */
  async deleteAll(
    resources: ReadonlyMap<string, SimCfnResource>,
    retainResources?: readonly string[],
  ): Promise<void> {
    await this.deleter(
      resources,
      this.teardownRetention(resources, retainResources),
    ).deleteAll();
  }

  /**
   * Take a record of the Resources an update kept, which the Stack is about to
   * stop holding.
   */
  recordRetained(resources: readonly SimCfnResource[]): void {
    this.retainedByUpdates.push(...resources);
  }

  /**
   * Delete the given Resources, in reverse dependency order among the whole
   * Stack.
   */
  async delete(
    resources: ReadonlyMap<string, SimCfnResource>,
    deleting: readonly SimCfnResource[],
    retention?: SimCfnResourceRetention,
  ): Promise<void> {
    await this.deleter(resources, retention).delete(deleting);
  }

  /**
   * Validate every Resource replacement before the update changes the Stack.
   */
  async assertUpdatesAllowed(
    currentResources: ReadonlyMap<string, SimCfnResource>,
    updatedResources: ReadonlyMap<string, SimCfnResource>,
    replacements: readonly SimCfnStackResourceReplacement[],
  ): Promise<void> {
    await Promise.all(
      replacements.map(async ({ current, updated }) => {
        await new SimCfnResourceUpdateValidator({
          current,
          updated,
        }).assertAllowed({
          simAws: this.simAws,
          currentResources,
          updatedResources,
          caller: this.context.caller,
        });
      }),
    );
  }

  /**
   * An update of this Stack from a changed template, in the same scope.
   */
  updater(properties: SimCfnStackUpdateProperties): SimCfnStackUpdater {
    const { background, resources, current, updated } = properties;

    return new SimCfnStackUpdater({
      accountRegionScope: this.accountRegionScope,
      operations: this,
      background,
      resources,
      current,
      updated,
    });
  }

  /**
   * Put this Stack's Resources back on the template it was deployed from, over
   * whatever a failed update left behind.
   *
   * The difference is worked out from the Resources the Stack holds now, not
   * from either template. A failure part way through is reconciled from where
   * it stopped. Nothing asserts that there is a change to make. An update that
   * failed before it touched a Resource has nothing to undo, and that is a
   * finished rollback.
   *
   * A Resource the failed update replaced is created again empty. The deployed
   * one was deleted to make room for the replacement, and there is nothing left
   * to put back.
   */
  async rollBack(properties: SimCfnStackUpdateProperties): Promise<void> {
    await this.updater(properties).apply();
  }

  /**
   * What a teardown of these Resources is to leave behind: the ones it named,
   * and the ones their own DeletionPolicy keeps.
   */
  private teardownRetention(
    resources: ReadonlyMap<string, SimCfnResource>,
    retainResources: readonly string[] | undefined,
  ): SimCfnResourceRetention {
    return new SimCfnResourceRetention({
      named: simCfnStackRetainedLogicalIds({
        stackName: this.stackName,
        resources,
        retainResources,
      }),
    });
  }

  private async publishAssets(): Promise<void> {
    await new SimCdkAssetsPublisher({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stackName: this.stackName,
      cdkOutContext: this.context.cdkOutContext,
      assetsCaller: this.context.publishingCaller(),
    }).publish();
  }

  private creator(
    resources: ReadonlyMap<string, SimCfnResource>,
  ): SimCfnStackResourceCreator {
    return new SimCfnStackResourceCreator({
      simAws: this.simAws,
      resources,
      stackName: this.stackName,
      cdkOutContext: this.context.cdkOutContext,
      bindings: this.bindings,
      caller: this.context.caller,
      resourceOrder: this.resourceOrder,
    });
  }

  private deleter(
    resources: ReadonlyMap<string, SimCfnResource>,
    retention: SimCfnResourceRetention | undefined,
  ): SimCfnStackResourceDeleter {
    return new SimCfnStackResourceDeleter({
      simAws: this.simAws,
      resources,
      stackName: this.stackName,
      caller: this.context.caller,
      retention,
    });
  }
}
