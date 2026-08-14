import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import { SimEcsTaskDefinitionId } from "../../task-definition/sim-ecs-task-definition-id.js";
import type { SimEcsTaskDefinitionStore } from "../../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsTaskDefinitionCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import type {
  SimDescribeTaskDefinitionCommand,
  SimDescribeTaskDefinitionCommandOutput,
} from "./describe-task-definition.command.js";

const acceptedInput: readonly string[] = ["taskDefinition", "include"];

/**
 * Simulated ECS DescribeTaskDefinitionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeTaskDefinitionCommand/
 */
export class DescribeTaskDefinitionCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<
      SimDescribeTaskDefinitionCommand,
      SimDescribeTaskDefinitionCommandOutput
    >
{
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(context: SimEcsTaskDefinitionCommandContext) {
    super(context, "DescribeTaskDefinition", acceptedInput);
    this.taskDefinitions = context.taskDefinitions;
    this.accountRegionScope = context.accountRegionScope;
  }

  /**
   * Describe the revision an identifier names.
   *
   * A family on its own resolves to its latest active revision, so it follows
   * registrations as they are made and falls back to an earlier revision when
   * the newest one is deregistered. A `family:revision` and an ARN both name
   * one revision, which stays describable after it is deregistered.
   */
  async handle(
    command: SimDescribeTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimDescribeTaskDefinitionCommandOutput> {
    this.refuseUnaccepted(command.input);

    const withTags = this.asksForTags(command.input.include);
    const id = SimEcsTaskDefinitionId.parse(
      command.input.taskDefinition,
      this.accountRegionScope,
    );

    await this.sequence();

    this.authorizer.authorizeAnyResource("ecs:DescribeTaskDefinition", options);

    const taskDefinition = this.taskDefinitions.resolve(id);

    return {
      $metadata: {},
      taskDefinition: taskDefinition.toOutput(),
      tags: withTags ? taskDefinition.toTagsOutput() : [],
    };
  }

  /**
   * Whether the request asked for the revision's tags.
   *
   * `TAGS` is the only `include` value this operation takes on real ECS, so
   * anything else is a request that would fail there too.
   */
  private asksForTags(include: readonly string[] | undefined): boolean {
    const asked = include ?? [];

    for (const value of asked) {
      if (value !== "TAGS") {
        throw new SimEcsInvalidParameterException(
          `DescribeTaskDefinition include ${value} is not a value this ` +
            `operation takes. Only TAGS is.`,
        );
      }
    }

    return asked.includes("TAGS");
  }
}
