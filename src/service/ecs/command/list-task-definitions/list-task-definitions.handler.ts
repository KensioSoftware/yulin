import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimEcsTaskDefinitionStore } from "../../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsTaskDefinitionCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import { SimEcsPage } from "../sim-ecs-page.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { ListTaskDefinitionsFilter } from "./list-task-definitions-filter.js";
import type {
  SimListTaskDefinitionsCommand,
  SimListTaskDefinitionsCommandOutput,
} from "./list-task-definitions.command.js";

const acceptedInput: readonly string[] = [
  "familyPrefix",
  "status",
  "sort",
  "maxResults",
  "nextToken",
];

/**
 * Simulated ECS ListTaskDefinitionsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListTaskDefinitionsCommand/
 */
export class ListTaskDefinitionsCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<
      SimListTaskDefinitionsCommand,
      SimListTaskDefinitionsCommandOutput
    >
{
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;

  constructor(context: SimEcsTaskDefinitionCommandContext) {
    super(context, "ListTaskDefinitions", acceptedInput);
    this.taskDefinitions = context.taskDefinitions;
  }

  /**
   * List the ARNs of the revisions the request asked for.
   *
   * They come out by family name and then by revision, which is the order real
   * ECS calls ascending. A request that says nothing about status gets the
   * active revisions.
   */
  async handle(
    command: SimListTaskDefinitionsCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimListTaskDefinitionsCommandOutput> {
    this.refuseUnaccepted(command.input);

    const filter = new ListTaskDefinitionsFilter(command.input);

    await this.sequence();

    this.authorizer.authorizeAnyResource("ecs:ListTaskDefinitions", options);

    const page = new SimEcsPage<SimArn>(
      filter
        .apply(this.taskDefinitions.revisions())
        .map((revision) => revision.taskDefinitionArn),
      command.input,
    );

    return {
      $metadata: {},
      taskDefinitionArns: page.items,
      ...(page.nextToken !== undefined && { nextToken: page.nextToken }),
    };
  }
}
