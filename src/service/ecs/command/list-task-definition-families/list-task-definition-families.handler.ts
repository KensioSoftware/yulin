import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimEcsTaskDefinitionStore } from "../../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsTaskDefinitionCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import { SimEcsPage } from "../sim-ecs-page.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { FamilyStatusFilter } from "./family-status-filter.js";
import type {
  SimListTaskDefinitionFamiliesCommand,
  SimListTaskDefinitionFamiliesCommandOutput,
} from "./list-task-definition-families.command.js";

const acceptedInput: readonly string[] = [
  "familyPrefix",
  "status",
  "maxResults",
  "nextToken",
];

/**
 * Simulated ECS ListTaskDefinitionFamiliesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListTaskDefinitionFamiliesCommand/
 */
export class ListTaskDefinitionFamiliesCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<
      SimListTaskDefinitionFamiliesCommand,
      SimListTaskDefinitionFamiliesCommandOutput
    >
{
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;

  constructor(context: SimEcsTaskDefinitionCommandContext) {
    super(context, "ListTaskDefinitionFamilies", acceptedInput);
    this.taskDefinitions = context.taskDefinitions;
  }

  /**
   * List the family names the request asked for.
   *
   * A request that says nothing about status gets the families with an active
   * revision, which is what real ECS reports.
   */
  async handle(
    command: SimListTaskDefinitionFamiliesCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimListTaskDefinitionFamiliesCommandOutput> {
    this.refuseUnaccepted(command.input);

    const filter = new FamilyStatusFilter(
      command.input.familyPrefix,
      command.input.status,
    );

    await this.sequence();

    this.authorizer.authorizeAnyResource(
      "ecs:ListTaskDefinitionFamilies",
      options,
    );

    const page = new SimEcsPage<string>(
      filter
        .apply(this.taskDefinitions.families())
        .map((family) => family.family),
      command.input,
    );

    return {
      $metadata: {},
      families: page.items,
      ...(page.nextToken !== undefined && { nextToken: page.nextToken }),
    };
  }
}
