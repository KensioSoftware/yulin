import { faker } from "@faker-js/faker";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../aws/sim-aws.js";
import {
  SimCloudFormationStack,
  type SimCloudFormationStackName,
  type SimCloudFormationTemplate,
} from "./stack/sim-cloudformation-stack.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../util/background/background.js";

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
   * Create a simulated CloudFormation Stack from a parsed template object.
   */
  createStack(
    props: SimCloudFormationCreateStackProps,
  ): SimCloudFormationStack {
    const { stackName = makeSimCloudFormationStackName(), template } = props;
    const simStackName = stackName as SimCloudFormationStackName;
    const stack = new SimCloudFormationStack({
      simAws: this.simAws,
      background: this.background,
      stackName: simStackName,
      template,
    });

    this.stacks.set(stack.stackName, stack);

    return stack;
  }

  /**
   * Create and deploy a simulated CloudFormation Stack from a parsed template
   * object.
   */
  async deployTemplate(
    props: SimCloudFormationCreateStackProps,
  ): Promise<SimCloudFormationStack> {
    const stack = this.createStack(props);

    await stack.deploy();
    await this.background.complete();

    return stack;
  }
}

/**
 * Generate a fake CloudFormation Stack name.
 */
export function makeSimCloudFormationStackName(): SimCloudFormationStackName {
  return `SimStack${faker.string.alphanumeric({ length: 8 })}` as SimCloudFormationStackName;
}
