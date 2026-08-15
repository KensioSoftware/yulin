import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimEcsContainerDefinitionType } from "../../task-definition/container/sim-ecs-container-definition.js";
import { simCfnEcsApiShape } from "../property/sim-cfn-ecs-api-shape.js";
import type { SimCfnEcsPropertyReader } from "../property/sim-cfn-ecs-property-reader.js";

/**
 * Read the `ContainerDefinitions` an AWS::ECS::TaskDefinition declares.
 *
 * Each definition is translated into the shape the ECS API uses and stored as
 * it was declared, whatever image it names. Nothing here reads what a
 * container means, for the reason nothing anywhere else in simulated ECS does:
 * Yulin never looks inside a container image, so the declaration is the whole
 * of what there is to hold.
 *
 * A missing list is left to `RegisterTaskDefinition` to refuse, so a template
 * and an SDK call are refused in the same words for the same mistake.
 */
export function simCfnEcsContainerDefinitions(
  reader: SimCfnEcsPropertyReader,
): readonly SimEcsContainerDefinitionType[] | undefined {
  return reader.list("ContainerDefinitions")?.map((definition, index) => {
    if (!isRecord(definition)) {
      throw reader.refuse(
        `ContainerDefinitions entry ${String(index)} is an object`,
      );
    }

    return simCfnEcsApiShape(definition) as SimEcsContainerDefinitionType;
  });
}
