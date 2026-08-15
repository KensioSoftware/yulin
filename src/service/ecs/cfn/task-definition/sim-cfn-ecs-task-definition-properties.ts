import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRegisterTaskDefinitionCommandInput } from "../../command/register-task-definition/register-task-definition.command.js";
import type { SimEcsTag } from "../../task-definition/sim-ecs-task-definition-parts.js";
import { SimCfnEcsPropertyReader } from "../property/sim-cfn-ecs-property-reader.js";
import { simCfnEcsContainerDefinitions } from "./sim-cfn-ecs-container-definitions.js";
import { SimCfnEcsTaskDefinitionFamily } from "./sim-cfn-ecs-task-definition-family.js";
import { SimCfnEcsTaskDefinitionPropertyRules } from "./sim-cfn-ecs-task-definition-property-rules.js";
import { SimCfnEcsTaskDefinitionSettings } from "./sim-cfn-ecs-task-definition-settings.js";

interface SimCfnEcsTaskDefinitionPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ECS::TaskDefinition CloudFormation properties into
 * RegisterTaskDefinition input.
 *
 * The reading is split three ways because the property groups are three
 * different jobs: the containers are a list to translate, the settings are a
 * declaration to pass on with two Roles resolved out of it, and the rest is
 * the family and the tags.
 */
export class SimCfnEcsTaskDefinitionProperties {
  private readonly resource: SimCfnResource;
  private readonly reader: SimCfnEcsPropertyReader;
  private readonly settings: SimCfnEcsTaskDefinitionSettings;
  private readonly rules: SimCfnEcsTaskDefinitionPropertyRules;

  constructor(properties: SimCfnEcsTaskDefinitionPropertiesProperties) {
    this.resource = properties.resource;
    this.reader = new SimCfnEcsPropertyReader(properties);
    this.settings = new SimCfnEcsTaskDefinitionSettings({
      resource: properties.resource,
      reader: this.reader,
    });
    this.rules = new SimCfnEcsTaskDefinitionPropertyRules({
      properties: properties.properties,
      ignorer: properties.resource,
    });
  }

  /**
   * The RegisterTaskDefinition input this Resource declares.
   */
  registerTaskDefinitionInput(): SimRegisterTaskDefinitionCommandInput {
    return {
      ...this.settings.declared(),
      family: this.family(),
      containerDefinitions: simCfnEcsContainerDefinitions(this.reader),
      tags: this.reader.apiList<SimEcsTag>("Tags"),
    };
  }

  /**
   * The task definition family.
   *
   * An unnamed task definition takes a family from the stack and the logical
   * ID, as real CloudFormation composes one from those and a random part.
   */
  family(): string {
    return (
      this.reader.text("Family") ??
      new SimCfnEcsTaskDefinitionFamily({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
      }).value
    );
  }

  /**
   * Record the properties the revision is registered without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }
}
