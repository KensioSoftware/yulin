import { faker } from "@faker-js/faker";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../aws/sim-aws.js";
import type {
  SimCloudFormationStack,
  SimCloudFormationStackName,
  SimCloudFormationTemplate,
} from "./stack/sim-cloudformation-stack.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../util/background/background.js";
import { assertDefined } from "../../util/defined/defined.js";
import { CreateStackCommandHandler } from "./command/create-stack/create-stack.handler.js";
import type {
  SimCreateStackCommand,
  SimCreateStackCommandOutput,
} from "./command/create-stack/create-stack.cmd.js";
import type {
  SimDescribeStacksCommand,
  SimDescribeStacksCommandOutput,
} from "./command/describe-stacks/describe-stacks.cmd.js";
import { DescribeStacksCommandHandler } from "./command/describe-stacks/describe-stacks.handler.js";

interface SimCloudFormationProps {
  readonly simAws: SimAws;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}

interface SimCloudFormationCreateStackProps {
  readonly stackName?: SimCloudFormationStackName | string;
  readonly template: SimCloudFormationTemplate;
}

/**
 * Simulated CloudFormation in one AWS Account and Region.
 */
export class SimCloudFormation {
  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly stacks = new Map<
    SimCloudFormationStackName,
    SimCloudFormationStack
  >();

  constructor(props: SimCloudFormationProps) {
    const {
      simAws,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background,
    } = props;

    this.simAws = simAws;
    this.background = background;
    this.accountRegionScope = accountRegionScope;
  }

  /**
   * Handle a Create Stack Command from the SDK.
   */
  async createStack(
    cmd: SimCreateStackCommand,
  ): Promise<SimCreateStackCommandOutput> {
    const handler = new CreateStackCommandHandler({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Describe Stacks Command from the SDK.
   */
  async describeStacks(
    cmd: SimDescribeStacksCommand,
  ): Promise<SimDescribeStacksCommandOutput> {
    const handler = new DescribeStacksCommandHandler({
      stacks: this.stacks,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Wait for a simulated CloudFormation Stack deploy operation to complete.
   */
  async waitForStackDeployComplete(
    stackName: SimCloudFormationStackName | string,
  ): Promise<void> {
    const stack = this.stacks.get(stackName as SimCloudFormationStackName);
    assertDefined(stack, `Sim CloudFormation Stack named ${stackName}`);

    await stack.waitForDeployComplete();
  }

  /**
   * Convenience wrapper method to create and deploy a simulated CloudFormation
   * Stack from a parsed template object.
   */
  async deployTemplate(
    props: SimCloudFormationCreateStackProps,
  ): Promise<SimCloudFormationStack> {
    const stackName = props.stackName ?? makeSimCloudFormationStackName();

    await this.createStack({
      input: {
        StackName: stackName,
        TemplateBody: JSON.stringify(props.template),
      },
    });

    const stack = this.stacks.get(stackName as SimCloudFormationStackName);
    assertDefined(stack, `Sim CloudFormation Stack named ${stackName}`);

    await stack.waitForDeployComplete();

    return stack;
  }
}

/**
 * Generate a fake CloudFormation Stack name.
 */
export function makeSimCloudFormationStackName(): SimCloudFormationStackName {
  return `SimStack${faker.string.alphanumeric({ length: 8 })}` as SimCloudFormationStackName;
}
