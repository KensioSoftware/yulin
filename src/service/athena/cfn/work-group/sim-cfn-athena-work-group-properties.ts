import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimAthenaWorkGroupConfigurationInput,
  SimCreateWorkGroupCommandInput,
} from "../../command/work-group/work-group.command.js";
import { SimCfnAthenaProperties } from "../sim-cfn-athena-property-values.js";
import { simCfnAthenaResourceError } from "../sim-cfn-athena-resource-error.js";
import { athenaWorkGroupResourceType } from "../sim-cfn-athena-resource-types.js";
import { workGroupConfigurationProperties } from "./sim-cfn-athena-work-group-configuration-properties.js";
import { SimCfnAthenaWorkGroupPropertyRules } from "./sim-cfn-athena-work-group-property-rules.js";

const maximumNameLength = 128;

/**
 * Reads AWS::Athena::WorkGroup properties into the shape CreateWorkGroup
 * takes.
 *
 * The template's property names are the API's, so this is mostly reading and
 * type checking. What the simulation will not act on is recorded through the
 * property rules rather than refused, so a stack carrying an Athena setting
 * this simulator has no answer for still deploys.
 */
export class SimCfnAthenaWorkGroupProperties {
  private readonly resource: SimCfnResource;
  private readonly read: SimCfnAthenaProperties;
  private readonly rules: SimCfnAthenaWorkGroupPropertyRules;

  constructor(properties: {
    readonly resource: SimCfnResource;
    readonly properties: SimCfnTemplateValueRecord;
  }) {
    this.resource = properties.resource;
    this.read = new SimCfnAthenaProperties(properties.properties, (reason) =>
      simCfnAthenaResourceError(
        athenaWorkGroupResourceType,
        properties.resource.logicalId,
        reason,
      ),
    );
    this.rules = new SimCfnAthenaWorkGroupPropertyRules({
      properties: properties.properties,
      ignorer: properties.resource,
    });
  }

  /**
   * The workgroup name.
   *
   * An unnamed workgroup is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  name(): string {
    return (
      this.read.string("Name") ??
      new SimCfnGeneratedResourceName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
        maximumLength: maximumNameLength,
      }).value
    );
  }

  /**
   * Everything CreateWorkGroup takes, read out of the template.
   */
  createInput(): SimCreateWorkGroupCommandInput {
    return {
      Name: this.name(),
      Description: this.read.string("Description"),
      Configuration: this.configuration(),
    };
  }

  /**
   * The state the template asks the workgroup to be in.
   *
   * `CreateWorkGroup` has no state field, so a workgroup the template disables
   * is created and then updated. A template asking for `ENABLED`, which is
   * where a workgroup starts, needs neither.
   */
  state(): string | undefined {
    return this.read.string("State");
  }

  /**
   * Record the properties the workgroup is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }

  private configuration(): SimAthenaWorkGroupConfigurationInput | undefined {
    const configuration = this.read.nested("WorkGroupConfiguration");

    if (configuration === undefined) {
      return undefined;
    }

    return workGroupConfigurationProperties(configuration);
  }
}
