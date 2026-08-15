import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnEcsTaskDefinitionFamily } from "./sim-cfn-ecs-task-definition-family.js";

/**
 * The CloudFormation Resource type a task definition is declared as.
 */
export const simCfnEcsTaskDefinitionType = "AWS::ECS::TaskDefinition";

/**
 * One container, as a template declares it.
 */
export interface SimCfnEcsDeclaredContainer {
  readonly name: string | undefined;
  readonly image: string | undefined;
}

/**
 * What an AWS::ECS::TaskDefinition Resource says it will register.
 *
 * This reads a Resource before anything has been created from it, which is
 * what a binding supplied at deploy time has to be checked against: the Stack
 * validates its bindings as it is built, long before a task definition
 * exists to look one up in.
 *
 * Properties have already had Parameters and intrinsic functions resolved by
 * then, so a family or an image built by `Fn::Sub` reads here as the string it
 * resolved to. A value that is still an expression names nothing, as it does
 * for an executable Resource binding.
 */
export class SimCfnEcsDeclaredTaskDefinition {
  private readonly resource: SimCfnResource;

  constructor(resource: SimCfnResource) {
    this.resource = resource;
  }

  /**
   * The task definition Resources of a Stack.
   */
  static of(
    resources: ReadonlyMap<string, SimCfnResource>,
  ): readonly SimCfnEcsDeclaredTaskDefinition[] {
    return resources
      .values()
      .filter((resource) => resource.type === simCfnEcsTaskDefinitionType)
      .map((resource) => new SimCfnEcsDeclaredTaskDefinition(resource))
      .toArray();
  }

  /**
   * The Resource this task definition is declared by.
   */
  get declaredBy(): SimCfnResource {
    return this.resource;
  }

  /**
   * The family this Resource will register under.
   *
   * A template that names no family gets the one CloudFormation would have
   * generated, so a binding naming that family resolves the same way it will
   * when the Resource is created.
   */
  family(): string {
    const declared = this.resource.properties["Family"];

    if (typeof declared === "string" && declared !== "") {
      return declared;
    }

    return new SimCfnEcsTaskDefinitionFamily({
      stackName: this.resource.stackName,
      logicalId: this.resource.logicalId,
    }).value;
  }

  /**
   * The containers this Resource declares, by the two fields a binding is
   * matched on.
   */
  containers(): readonly SimCfnEcsDeclaredContainer[] {
    const declared = this.resource.properties["ContainerDefinitions"];

    if (!Array.isArray(declared)) {
      return [];
    }

    return declared
      .filter((container) => isRecord(container))
      .map((container) => ({
        name: simCfnEcsDeclaredText(container["Name"]),
        image: simCfnEcsDeclaredText(container["Image"]),
      }));
  }
}

/**
 * A declared value where the template wrote a string for it.
 */
function simCfnEcsDeclaredText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value;
}
