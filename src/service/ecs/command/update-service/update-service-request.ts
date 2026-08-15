import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimEcsClientException } from "../../error/sim-ecs.error.js";
import { simEcsDesiredCount } from "../../service/sim-ecs-desired-count.js";
import { SimEcsTaskDefinitionId } from "../../task-definition/sim-ecs-task-definition-id.js";
import type { SimUpdateServiceCommandInput } from "./update-service.command.js";

/**
 * What one `UpdateService` request asked to change.
 *
 * Both changes are optional on real ECS, and a request making neither is
 * refused here rather than answered with the service unchanged: an update that
 * changes nothing is a request that has lost what it meant to say.
 */
export class SimEcsUpdateServiceRequest {
  public readonly taskDefinitionId: SimEcsTaskDefinitionId | undefined;
  public readonly desiredCount: number | undefined;

  constructor(
    input: SimUpdateServiceCommandInput,
    accountRegionScope: SimAwsAccountRegionScope,
  ) {
    this.taskDefinitionId =
      input.taskDefinition === undefined
        ? undefined
        : SimEcsTaskDefinitionId.parse(
            input.taskDefinition,
            accountRegionScope,
          );
    this.desiredCount =
      input.desiredCount === undefined
        ? undefined
        : simEcsDesiredCount(input.desiredCount);

    this.refuseEmpty();
  }

  private refuseEmpty(): void {
    if (
      this.taskDefinitionId === undefined &&
      this.desiredCount === undefined
    ) {
      throw new SimEcsClientException(
        "UpdateService needs a desiredCount, a taskDefinition, or both. " +
          "Nothing else about a service is simulated.",
      );
    }
  }
}
