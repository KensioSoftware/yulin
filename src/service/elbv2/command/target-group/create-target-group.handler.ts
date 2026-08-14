import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { simElbV2ResourceId } from "../../sim-elbv2-resource-id.js";
import { simElbV2TargetGroupEndpoint } from "../../target-group/sim-elbv2-target-group-endpoint.js";
import { simElbV2TargetGroupName } from "../../target-group/sim-elbv2-target-group-name.js";
import { SimElbV2TargetGroup } from "../../target-group/sim-elbv2-target-group.js";
import type { SimElbV2TargetGroupUsage } from "../../target-group/sim-elbv2-target-group-usage.js";
import { simElbV2TargetType } from "../../target-group/sim-elbv2-target-type.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimCreateTargetGroupCommand,
  SimCreateTargetGroupCommandOutput,
} from "./target-group.command.js";

interface CreateTargetGroupCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly usage: SimElbV2TargetGroupUsage;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Simulated ELBv2 CreateTargetGroupCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateTargetGroup.html
 */
export class CreateTargetGroupCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimCreateTargetGroupCommand,
      SimCreateTargetGroupCommandOutput
    >
{
  private readonly usage: SimElbV2TargetGroupUsage;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: CreateTargetGroupCommandHandlerProperties) {
    super(properties);
    this.usage = properties.usage;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Create a target group of a type this simulation can route to.
   *
   * The target type decides whether a protocol and port belong on the group at
   * all, so it is read first and then asked, rather than each combination
   * being checked here.
   */
  async handle(
    command: SimCreateTargetGroupCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimCreateTargetGroupCommandOutput> {
    const { input } = command;

    const name = simElbV2TargetGroupName(input.Name);
    const targetType = simElbV2TargetType(input.TargetType);
    const endpoint = simElbV2TargetGroupEndpoint(input);

    targetType.validateGroup(endpoint);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeAnyResource("CreateTargetGroup", options);

    this.stores.targetGroups.requireNameAvailable(name);

    const targetGroup = new SimElbV2TargetGroup({
      ...endpoint,
      name,
      targetType,
      vpcId: input.VpcId,
      id: simElbV2ResourceId(this.stores.targetGroups.nextSequence()),
      accountRegionScope: this.accountRegionScope,
    });

    targetGroup.modifyHealthCheck(input);
    this.stores.targetGroups.put(targetGroup);

    return {
      $metadata: {},
      TargetGroups: [
        targetGroup.view(this.usage.loadBalancerArns(targetGroup)),
      ],
    };
  }
}
