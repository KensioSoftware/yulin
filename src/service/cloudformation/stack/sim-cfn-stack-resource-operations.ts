import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnExecutableResourceBinding } from "../bind/sim-cfn-exec-binding.type.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import { SimCdkAssetsPublisher } from "../cdk/assets/sim-cdk-assets-publisher.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import { SimCfnStackResourceCreator } from "./deploy/sim-cfn-stack-resource-creator.js";
import { SimCfnStackResourceDeleter } from "./teardown/sim-cfn-stack-resource-deleter.js";
import { SimCfnStackUpdater } from "./update/sim-cfn-stack-updater.js";
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
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
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
  private readonly bindings:
    | readonly SimCfnExecutableResourceBinding[]
    | undefined;
  private cdkOutContext: SimCdkOutContext | undefined;

  constructor(properties: SimCfnStackResourceOperationsProperties) {
    const { simAws, accountRegionScope, stackName, cdkOutContext, bindings } =
      properties;

    this.simAws = simAws;
    this.accountRegionScope = accountRegionScope;
    this.stackName = stackName;
    this.cdkOutContext = cdkOutContext;
    this.bindings = bindings;
  }

  /**
   * Read Resources from a different CDK cloud assembly from now on.
   *
   * A synthesis writes the template and the assets manifest beside it together,
   * so a Stack updated from a re-synthesized template needs the manifest that
   * came with it. Keeping the one the Stack was deployed from would look up the
   * asset a replaced Resource names in a manifest written before it existed.
   */
  useCdkOutContext(cdkOutContext: SimCdkOutContext): void {
    this.cdkOutContext = cdkOutContext;
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

  /**
   * Delete every Resource in the given Stack Resource map.
   */
  async deleteAll(
    resources: ReadonlyMap<string, SimCfnResource>,
  ): Promise<void> {
    await this.deleter(resources).deleteAll();
  }

  /**
   * Delete the given Resources, in reverse dependency order among the whole
   * Stack.
   */
  async delete(
    resources: ReadonlyMap<string, SimCfnResource>,
    deleting: readonly SimCfnResource[],
  ): Promise<void> {
    await this.deleter(resources).delete(deleting);
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

  private async publishAssets(): Promise<void> {
    await new SimCdkAssetsPublisher({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stackName: this.stackName,
      cdkOutContext: this.cdkOutContext,
    }).publish();
  }

  private creator(
    resources: ReadonlyMap<string, SimCfnResource>,
  ): SimCfnStackResourceCreator {
    return new SimCfnStackResourceCreator({
      simAws: this.simAws,
      resources,
      stackName: this.stackName,
      cdkOutContext: this.cdkOutContext,
      bindings: this.bindings,
    });
  }

  private deleter(
    resources: ReadonlyMap<string, SimCfnResource>,
  ): SimCfnStackResourceDeleter {
    return new SimCfnStackResourceDeleter({
      simAws: this.simAws,
      resources,
      stackName: this.stackName,
    });
  }
}
