import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type { SimCfnIgnoredProperty } from "../resource/ignore/sim-cfn-ignored-property.type.js";
import type {
  CfnTemplateBodyRecord,
  SimCfnTemplate,
} from "../template/sim-cfn-template.js";
import {
  SimCfnStackDeletionLifecycle,
  type SimCfnStackDeleteProperties,
} from "./teardown/sim-cfn-stack-deletion-lifecycle.js";
import { makeSimCfnStackResourceMap } from "./resource-map/sim-cfn-stack-resource-map.js";
import { SimCfnStackResourceLookup } from "./resource-map/sim-cfn-stack-resource-lookup.js";
import { SimCfnStackDeploymentLifecycle } from "./deploy/sim-cfn-stack-deployment-lifecycle.js";
import { SimCfnStackResourceOperations } from "./sim-cfn-stack-resource-operations.js";
import { SimCfnStackUpdateLifecycle } from "./update/sim-cfn-stack-update-lifecycle.js";
import type { SimCfnStackOutput } from "./output/sim-cfn-stack-output.js";
import type { SimCfnDeployedStack } from "./sim-cfn-deployed-stack.type.js";
import { SimCfnStackOutputs } from "./output/sim-cfn-stack-outputs.js";
import { SimCfnStackOutputLookup } from "./output/sim-cfn-stack-output-lookup.js";
import { SimCfnStackResourceReport } from "./report/sim-cfn-stack-resource-report.js";
import { SimCfnStackOperationStatus } from "./status/sim-cfn-stack-operation-status.js";
import { validateSimCfnExecutableResourceBindings } from "../bind/validate/sim-cfn-exec-binding-validator.js";
import type { SimCfnStackId } from "./sim-cfn-stack-id.js";
import type {
  SimCloudFormationStackProperties,
  SimCloudFormationStackStatus,
  SimCfnStackUpdateProperties,
  SimCloudFormationStackName,
} from "./sim-cfn-stack.type.js";

/**
 * Lightweight simulated CloudFormation Stack.
 *
 * This class owns the externally visible Stack lifecycle: identity, template
 * body, resources, status, error, and wait-for-completion behavior for
 * deploying, updating and deleting. It delegates the mechanics of each to
 * smaller collaborators:
 *
 * - makeSimCfnStackResourceMap converts the template into runtime resources.
 * - A lifecycle per Stack operation owns that operation's status and
 *   completion, and SimCfnStackOperationScheduler decides when each runs.
 * - SimCfnStackResourceOperations creates and deletes resources against
 *   simulated AWS, and SimCfnStackUpdater does some of each at once against a
 *   changed template.
 */
export class SimCfnStack implements SimCfnDeployedStack {
  public readonly lifecycle: SimCfnStackDeploymentLifecycle;
  public readonly updating: SimCfnStackUpdateLifecycle;
  public readonly deletion: SimCfnStackDeletionLifecycle;
  public readonly stackName: SimCloudFormationStackName;
  public readonly stackId: SimCfnStackId;
  public readonly resourceMap: Map<string, SimCfnResource>;
  public outputs = new Map<string, SimCfnStackOutput>();

  private readonly background: BackgroundScheduler;
  private readonly operations: SimCfnStackResourceOperations;
  private readonly operationStatus: SimCfnStackOperationStatus;
  private readonly stackOutputs: SimCfnStackOutputs;
  private cfnTemplate: SimCfnTemplate;

  constructor(properties: SimCloudFormationStackProperties) {
    const {
      simAws,
      accountRegionScope,
      background,
      stackName,
      stackId,
      template,
      cdkOutContext,
      bindings,
      caller,
      resourceOrder,
      exports,
    } = properties;

    this.background = background;
    this.stackName = stackName;
    this.stackId = stackId;
    this.stackOutputs = new SimCfnStackOutputs({ stackName, exports });
    this.cfnTemplate = template;
    this.resourceMap = makeSimCfnStackResourceMap({
      accountRegionScope,
      background,
      template: this.cfnTemplate,
    });
    validateSimCfnExecutableResourceBindings({
      stackName,
      resources: this.resourceMap,
      bindings,
    });
    this.operations = new SimCfnStackResourceOperations({
      simAws,
      accountRegionScope,
      stackName,
      cdkOutContext,
      bindings,
      caller,
      resourceOrder,
    });
    this.lifecycle = new SimCfnStackDeploymentLifecycle({
      background,
      stackName,
      runDeployment: async (): Promise<void> => {
        await this.operations.createAll(this.resourceMap);
        this.resolveOutputs();
      },
    });
    this.updating = new SimCfnStackUpdateLifecycle({ background, stackName });
    this.deletion = new SimCfnStackDeletionLifecycle({
      background,
      runTeardown: async (
        deleteProperties: SimCfnStackDeleteProperties,
      ): Promise<void> => {
        await this.teardown(deleteProperties);
      },
    });
    this.operationStatus = new SimCfnStackOperationStatus({
      deployment: this.lifecycle,
      update: this.updating,
      deletion: this.deletion,
    });
  }

  /** The externally visible Stack status. */
  public get status(): SimCloudFormationStackStatus {
    return this.operationStatus.status;
  }

  /** The parsed template this Stack is deployed from. */
  public get currentTemplate(): SimCfnTemplate {
    return this.cfnTemplate;
  }

  /** The template body this Stack is deployed from. */
  public get template(): CfnTemplateBodyRecord {
    return this.cfnTemplate.template;
  }

  /** The error the operation the status reports failed with, if it failed. */
  public get error(): Error | undefined {
    return this.operationStatus.error;
  }

  /** Start deploying this simulated Stack into simulated AWS. */
  async deploy(): Promise<void> {
    await this.lifecycle.deploy();
  }

  /** Wait for the scheduled deployment task to finish. */
  async waitForDeployComplete(): Promise<void> {
    await this.lifecycle.waitForComplete();
  }

  /**
   * Apply a changed template to this deployed Stack.
   *
   * The Resources the new template adds are created, the ones it drops are
   * deleted, and the ones whose resolved template changed are replaced.
   * Everything else is left alone, holding whatever it holds in simulated AWS.
   *
   * An update that would do nothing, and one asked for while another is still
   * running, are both refused the way CloudFormation refuses them, before the
   * Stack's template moves on. The Resource work is scheduled in the
   * background, as a deployment is, so callers that need the final state should
   * use waitForUpdateComplete().
   *
   * A template that came from a synthesis of its own brings the cloud assembly
   * it was written into with it, so Resources it replaces read the assets that
   * synthesis staged rather than the ones the Stack was deployed with.
   */
  async update(
    template: SimCfnTemplate,
    properties: SimCfnStackUpdateProperties = {},
  ): Promise<void> {
    this.updating.assertNotUpdating();

    const updater = this.operations.updater({
      background: this.background,
      resources: this.resourceMap,
      current: this.cfnTemplate,
      updated: template,
    });

    updater.assertHasChanges();

    // Only once the update is going ahead, so a refused update leaves the Stack
    // reading the cloud assembly it was deployed from and running as whoever
    // deployed it.
    this.operations.useUpdate(properties);

    this.cfnTemplate = template;

    await this.updating.update(async (): Promise<void> => {
      await updater.apply();
      this.resolveOutputs();
    });
  }

  /** Wait for the scheduled Stack update to finish. */
  async waitForUpdateComplete(): Promise<void> {
    await this.updating.waitForComplete();
  }

  /**
   * Start deleting this Stack from simulated AWS.
   *
   * Deletion is scheduled in the background, as deployment is, so this returns
   * before the Resources have gone. The optional onDeleteComplete callback runs
   * once the teardown has finished successfully, which is when the Stack name
   * becomes free to use again.
   *
   * Resources named in retainResources are checked against the Stack here
   * rather than in the background, so a caller naming one the Stack does not
   * have is refused while it can still be told about it.
   */
  async delete(properties: SimCfnStackDeleteProperties = {}): Promise<void> {
    this.operations.assertRetainable(
      this.resourceMap,
      properties.retainResources,
    );

    await this.deletion.delete(properties);
  }

  /** Wait for the scheduled Stack deletion to finish. */
  async waitForDeleteComplete(): Promise<void> {
    await this.deletion.waitForComplete();
  }

  /**
   * Delete this Stack's Resources from simulated AWS, in reverse dependency
   * order.
   *
   * The Resource half of deleting a Stack, without the Stack-level status or
   * the Stack name release that delete() puts on top of it.
   */
  async teardown(properties: SimCfnStackDeleteProperties = {}): Promise<void> {
    await this.operations.deleteAll(
      this.resourceMap,
      properties.retainResources,
    );
    this.stackOutputs.release();
  }

  /** Every Stack Resource, in the order the template declared them. */
  public get resources(): readonly SimCfnResource[] {
    return this.resourceMap.values().toArray();
  }

  /**
   * Get a Stack Resource by logical ID, or by the CDK construct ID a
   * synthesized logical ID was generated from.
   */
  getResource(logicalId: string): SimCfnResource | undefined {
    return new SimCfnStackResourceLookup(this.resourceMap).find(logicalId);
  }

  /**
   * Get one Stack Output's resolved value, as the string it is.
   *
   * An Output the template never declared throws, as does one that resolved to
   * something other than a string.
   */
  output(outputKey: string): string {
    return new SimCfnStackOutputLookup({
      stackName: this.stackName,
      outputs: this.outputs,
    }).value(outputKey);
  }

  /** Resources skipped because their sim implementation is not available. */
  public get skippedResources(): readonly SimCfnResource[] {
    return this.report.skipped;
  }

  /** Resources deliberately created as nothing, because nothing reads them. */
  public get inertResources(): readonly SimCfnResource[] {
    return this.report.inert;
  }

  /** Resources a teardown recorded rather than deleted. */
  public get skippedResourceDeletions(): readonly SimCfnResource[] {
    return this.report.deletionSkipped;
  }

  /**
   * Resources left in simulated AWS rather than deleted, whether a teardown
   * stepped over them or an update replaced them and kept the deployed one.
   */
  public get retainedResources(): readonly SimCfnResource[] {
    return [...this.report.retained, ...this.operations.retainedResources];
  }

  /** Every property or Parameter that did not reach simulated AWS as written. */
  public get ignoredProperties(): readonly SimCfnIgnoredProperty[] {
    return this.report.ignoredProperties;
  }

  private get report(): SimCfnStackResourceReport {
    return new SimCfnStackResourceReport(this.resourceMap, this.cfnTemplate);
  }

  private resolveOutputs(): void {
    this.outputs = this.stackOutputs.resolve(
      this.cfnTemplate,
      this.resourceMap,
    );
  }
}

export {
  type SimCfnStackUpdateProperties,
  type SimCloudFormationStackName,
  type SimCloudFormationStackStatus,
} from "./sim-cfn-stack.type.js";
