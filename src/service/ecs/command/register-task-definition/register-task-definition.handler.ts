import type { CommandHandler } from "../../../../command/command-handler.js";
import { requiredSimEcsName } from "../../sim-ecs-name.js";
import { SimEcsContainerDefinitions } from "../../task-definition/container/sim-ecs-container-definitions.js";
import type { SimEcsTaskDefinitionArn } from "../../task-definition/sim-ecs-task-definition-arn.js";
import {
  simEcsTaskDefinitionSettingNames,
  SimEcsTaskDefinitionSettings,
} from "../../task-definition/sim-ecs-task-definition-settings.js";
import type { SimEcsTaskDefinitionStore } from "../../task-definition/sim-ecs-task-definition-store.js";
import { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcsTaskDefinitionCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import type {
  SimRegisterTaskDefinitionCommand,
  SimRegisterTaskDefinitionCommandOutput,
} from "./register-task-definition.command.js";

/**
 * What a simulated RegisterTaskDefinition request may declare.
 *
 * Anything else is refused rather than dropped, since a registration is a
 * declaration and a declaration missing from the revision it made would be
 * state a test could pass against without it being what was asked for.
 */
const acceptedInput: readonly string[] = [
  "family",
  "containerDefinitions",
  "tags",
  ...simEcsTaskDefinitionSettingNames,
];

/**
 * Simulated ECS RegisterTaskDefinitionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/RegisterTaskDefinitionCommand/
 */
export class RegisterTaskDefinitionCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<
      SimRegisterTaskDefinitionCommand,
      SimRegisterTaskDefinitionCommandOutput
    >
{
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;
  private readonly taskDefinitionArn: SimEcsTaskDefinitionArn;

  constructor(context: SimEcsTaskDefinitionCommandContext) {
    super(context, "RegisterTaskDefinition", acceptedInput);
    this.taskDefinitions = context.taskDefinitions;
    this.taskDefinitionArn = context.taskDefinitionArn;
  }

  /**
   * Register a new revision of a task definition family.
   *
   * The revision number comes from the family rather than from the request:
   * the first registration is revision 1 and each one after it takes the next
   * number, whether or not the revisions before it are still active.
   *
   * The declaration is read before authorization, because a malformed
   * registration is malformed whoever made it. Nothing is stored until the
   * caller has been authorized.
   */
  async handle(
    command: SimRegisterTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimRegisterTaskDefinitionCommandOutput> {
    this.refuseUnaccepted(command.input);

    const family = requiredSimEcsName(
      command.input.family,
      "task definition family",
    );
    const containers = new SimEcsContainerDefinitions(
      command.input.containerDefinitions,
    );
    const settings = new SimEcsTaskDefinitionSettings(command.input);

    await this.sequence();

    const caller = this.authorizer.authorizeAnyResource(
      "ecs:RegisterTaskDefinition",
      options,
    );
    this.authorizer.authorizePassRole(
      [settings.taskRoleArn, settings.executionRoleArn],
      options,
    );

    const familyRevisions = this.taskDefinitions.family(family);
    const revision = familyRevisions.nextRevisionNumber();
    const taskDefinition = new SimEcsTaskDefinition({
      taskDefinitionArn: this.taskDefinitionArn.make(family, revision),
      family,
      revision,
      containers,
      settings,
      tags: command.input.tags ?? [],
      registeredAt: this.background.now(),
      registeredBy: caller.arn,
    });

    familyRevisions.add(taskDefinition);

    return {
      $metadata: {},
      taskDefinition: taskDefinition.toOutput(),
      tags: taskDefinition.toTagsOutput(),
    };
  }
}
