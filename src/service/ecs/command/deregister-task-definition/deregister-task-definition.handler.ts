import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEcsClientException } from "../../error/sim-ecs.error.js";
import { SimEcsTaskDefinitionId } from "../../task-definition/sim-ecs-task-definition-id.js";
import type { SimEcsTaskDefinitionStore } from "../../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsTaskDefinitionCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import type {
  SimDeregisterTaskDefinitionCommand,
  SimDeregisterTaskDefinitionCommandOutput,
} from "./deregister-task-definition.command.js";

const acceptedInput: readonly string[] = ["taskDefinition"];

/**
 * Simulated ECS DeregisterTaskDefinitionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DeregisterTaskDefinitionCommand/
 */
export class DeregisterTaskDefinitionCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<
      SimDeregisterTaskDefinitionCommand,
      SimDeregisterTaskDefinitionCommandOutput
    >
{
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(context: SimEcsTaskDefinitionCommandContext) {
    super(context, "DeregisterTaskDefinition", acceptedInput);
    this.taskDefinitions = context.taskDefinitions;
    this.accountRegionScope = context.accountRegionScope;
  }

  /**
   * Deregister one revision, which marks it `INACTIVE` rather than removing
   * it.
   *
   * The revision stays describable by `family:revision` and by ARN, because
   * something already holding either of those still needs to find out what it
   * declared. What it stops being is the revision the family resolves to, and
   * it stops being listed among the family's active revisions.
   *
   * A revision that is already inactive is reported as it stands. The instant
   * it was deregistered belongs to the deregistration that did it, so a second
   * request does not move it.
   */
  async handle(
    command: SimDeregisterTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimDeregisterTaskDefinitionCommandOutput> {
    this.refuseUnaccepted(command.input);

    const id = SimEcsTaskDefinitionId.parse(
      command.input.taskDefinition,
      this.accountRegionScope,
    );

    if (id.revision === undefined) {
      throw new SimEcsClientException(
        `Deregistering needs one revision, named as family:revision or as a ` +
          `task definition ARN. ${String(command.input.taskDefinition)} names ` +
          `a family.`,
      );
    }

    await this.sequence();

    this.authorizer.authorizeAnyResource(
      "ecs:DeregisterTaskDefinition",
      options,
    );

    const taskDefinition = this.taskDefinitions.resolve(id);

    if (taskDefinition.isActive()) {
      taskDefinition.markDeregistered(this.background.now());
    }

    return {
      $metadata: {},
      taskDefinition: taskDefinition.toOutput(),
    };
  }
}
