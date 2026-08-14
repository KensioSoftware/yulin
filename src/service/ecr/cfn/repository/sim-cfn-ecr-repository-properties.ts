import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnEcrRepositoryName } from "./sim-cfn-ecr-repository-name.js";
import { SimCfnEcrRepositoryPropertyRules } from "./sim-cfn-ecr-repository-property-rules.js";

/**
 * A refusal naming the Resource whose properties could not be read.
 */
export function ecrRepositoryPropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid sim ECR CloudFormation Resource ${logicalId}: ${reason}`,
  );
}

interface SimCfnEcrRepositoryPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ECR::Repository CloudFormation properties.
 *
 * A repository declares only a name that this simulation acts on. Everything
 * else a template can put on one describes image content, which nothing here
 * reads, so it is recorded as ignored by the property rules.
 */
export class SimCfnEcrRepositoryProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly rules: SimCfnEcrRepositoryPropertyRules;

  constructor(properties: SimCfnEcrRepositoryPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.rules = new SimCfnEcrRepositoryPropertyRules({
      properties: properties.properties,
      ignorer: properties.resource,
    });
  }

  /**
   * The repository name.
   *
   * An unnamed repository is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  repositoryName(): string {
    const name = this.properties["RepositoryName"];

    if (name === undefined) {
      return new SimCfnEcrRepositoryName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
      }).value;
    }

    if (typeof name !== "string") {
      throw ecrRepositoryPropertyError(
        this.resource.logicalId,
        "RepositoryName must be a string",
      );
    }

    return name;
  }

  /**
   * Record the properties the repository is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }
}
