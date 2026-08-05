import type { SimAws } from "../../aws/sim-aws.js";
import type { Brand } from "../../../util/brand.type.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type { SimCfnIgnoredProperty } from "../resource/ignore/sim-cfn-ignored-property.type.js";
import type {
  CfnTemplateBodyRecord,
  SimCfnTemplate,
} from "../template/sim-cfn-template.js";
import { SimCfnStackResourceCreator } from "./deploy/sim-cfn-stack-resource-creator.js";
import { SimCfnStackResourceDeleter } from "./teardown/sim-cfn-stack-resource-deleter.js";
import { makeSimCfnStackResourceMap } from "./resource-map/sim-cfn-stack-resource-map.js";
import { SimCfnStackDeploymentLifecycle } from "./deploy/sim-cfn-stack-deployment-lifecycle.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import { SimCdkAssetsPublisher } from "../cdk/assets/sim-cdk-assets-publisher.js";
import type { SimCfnExecutableResourceBinding } from "../bind/sim-cfn-exec-binding.type.js";
import type { SimCfnStackOutput } from "./output/sim-cfn-stack-output.js";
import { SimCfnStackOutputResolver } from "./output/sim-cfn-stack-output-resolver.js";
import { validateSimCfnExecutableResourceBindings } from "../bind/validate/sim-cfn-exec-binding-validator.js";

export type SimCloudFormationStackName = Brand<
  string,
  "SimCloudFormationStackName"
>;

export type SimCloudFormationStackStatus =
  | "REVIEW_IN_PROGRESS"
  | "CREATE_IN_PROGRESS"
  | "CREATE_COMPLETE"
  | "CREATE_FAILED";

interface SimCloudFormationStackProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly stackName: SimCloudFormationStackName;
  readonly template: SimCfnTemplate;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
}

/**
 * Lightweight simulated CloudFormation Stack.
 *
 * This class owns the externally visible Stack lifecycle: identity, template
 * body, resources, deployment status, deployment error, and wait-for-completion
 * behavior. It delegates lower-level deployment mechanics to smaller
 * collaborators:
 *
 * - makeSimCfnStackResourceMap converts the template into runtime resources.
 * - SimCfnStackDeploymentScheduler controls when deployment runs in the
 *   background.
 * - SimCfnStackResourceCreator creates resources in dependency order.
 */
export class SimCfnStack {
  public readonly lifecycle: SimCfnStackDeploymentLifecycle;
  public readonly stackName: SimCloudFormationStackName;
  public readonly template: CfnTemplateBodyRecord;
  public readonly resources: Map<string, SimCfnResource>;
  public outputs = new Map<string, SimCfnStackOutput>();

  private readonly simAws: SimAws;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly cfnTemplate: SimCfnTemplate;
  private readonly cdkOutContext: SimCdkOutContext | undefined;
  private readonly bindings:
    readonly SimCfnExecutableResourceBinding[] | undefined;
  private readonly skippedResourceList: SimCfnResource[] = [];

  constructor(properties: SimCloudFormationStackProperties) {
    const {
      simAws,
      accountRegionScope,
      background,
      stackName,
      template,
      cdkOutContext,
      bindings,
    } = properties;

    this.simAws = simAws;
    this.accountRegionScope = accountRegionScope;
    this.stackName = stackName;
    this.cfnTemplate = template;
    this.cdkOutContext = cdkOutContext;
    this.bindings = bindings;
    this.template = this.cfnTemplate.template;
    this.resources = makeSimCfnStackResourceMap({
      accountRegionScope,
      background,
      template: this.cfnTemplate,
    });
    validateSimCfnExecutableResourceBindings({
      stackName,
      resources: this.resources,
      bindings,
    });
    this.lifecycle = new SimCfnStackDeploymentLifecycle({
      background,
      stackName,
      runDeployment: async (): Promise<void> => {
        await this.createResources();
      },
    });
  }

  /**
   * Start deploying this simulated Stack into simulated AWS.
   */
  async deploy(): Promise<void> {
    await this.lifecycle.deploy();
  }

  /**
   * Wait for the scheduled deployment task to finish.
   */
  async waitForDeployComplete(): Promise<void> {
    await this.lifecycle.waitForComplete();
  }

  /**
   * Delete this Stack's Resources from simulated AWS, in reverse dependency
   * order.
   *
   * The Resource half of deleting a Stack. Stack deletion status, releasing the
   * Stack name and the DeleteStack command itself sit on top of this rather
   * than inside it, so the Resource teardown can be exercised on its own.
   */
  async teardown(): Promise<void> {
    await new SimCfnStackResourceDeleter({
      simAws: this.simAws,
      resources: this.resources,
      stackName: this.stackName,
    }).deleteAll();
  }

  /**
   * Get a Stack Resource by logical ID.
   */
  getResource(logicalId: string): SimCfnResource | undefined {
    return this.resources.get(logicalId);
  }

  /**
   * Resources that were skipped because their sim implementation is not yet
   * available.
   */
  public get skippedResources(): readonly SimCfnResource[] {
    return this.skippedResourceList;
  }

  /**
   * Resources the teardown recorded rather than deleted, because sim
   * CloudFormation has no way to delete their Resource type.
   *
   * Read from the Resources rather than collected during teardown, the same way
   * ignored properties are, so the Stack and its Resources cannot disagree.
   */
  public get skippedResourceDeletions(): readonly SimCfnResource[] {
    return this.resources
      .values()
      .filter((resource) => resource.deletionSkipped)
      .toArray();
  }

  /**
   * Every property the deployment created a Resource without acting on.
   *
   * Read from the Resources rather than collected during deployment, so a
   * Resource created outside a stack deployment still reports its own, and the
   * two never disagree.
   */
  public get ignoredProperties(): readonly SimCfnIgnoredProperty[] {
    return this.resources
      .values()
      .flatMap((resource) => resource.ignoredProperties)
      .toArray();
  }

  /**
   * Delegate resource dependency ordering and creation to the resource
   * creator.
   *
   * CDK cloud assembly assets are published into sim S3 first, as a real
   * `cdk deploy` publishes them before CloudFormation processes the template
   * that references them.
   */
  private async createResources(): Promise<void> {
    await new SimCdkAssetsPublisher({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stackName: this.stackName,
      cdkOutContext: this.cdkOutContext,
    }).publish();

    const resourceCreator = new SimCfnStackResourceCreator({
      simAws: this.simAws,
      resources: this.resources,
      stackName: this.stackName,
      cdkOutContext: this.cdkOutContext,
      bindings: this.bindings,
      skippedResources: this.skippedResourceList,
    });

    await resourceCreator.createAll();
    this.resolveOutputs();
  }

  private resolveOutputs(): void {
    const outputResolver = new SimCfnStackOutputResolver({
      template: this.cfnTemplate,
      resources: this.resources,
    });
    this.outputs = outputResolver.resolve();
  }
}
