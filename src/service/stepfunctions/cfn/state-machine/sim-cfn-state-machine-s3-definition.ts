import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimStatesDefinitionLocation,
  SimStatesDefinitionStore,
} from "../../definition/store/sim-states-definition-store.js";
import {
  simCfnStepFunctionsResourceError,
  simCfnStepFunctionsSkippedResourceError,
} from "../sim-cfn-step-functions-resource-error.js";
import { definitionS3LocationPropertyName } from "./sim-cfn-state-machine-property-names.js";
import { stateMachineResourceType } from "../sim-cfn-step-functions-resource-types.js";

interface SimCfnStateMachineS3DefinitionProperties {
  readonly logicalId: string;
  readonly definitions: SimStatesDefinitionStore;
}

/**
 * Reads the definition a `DefinitionS3Location` points at.
 *
 * CDK writes this form for `DefinitionBody.fromFile`, and for any definition
 * past the template size limit. The file is staged in the cloud assembly and
 * published to the bootstrap staging bucket, which sim CloudFormation does
 * before it deploys a Resource, so the object is there by the time this reads
 * it.
 *
 * `Version` is read past. Simulated S3 holds one body per key, and a template
 * naming a version gets that body.
 */
export class SimCfnStateMachineS3Definition {
  readonly #logicalId: string;
  readonly #definitions: SimStatesDefinitionStore;

  constructor(properties: SimCfnStateMachineS3DefinitionProperties) {
    this.#logicalId = properties.logicalId;
    this.#definitions = properties.definitions;
  }

  /**
   * The Amazon States Language the object holds.
   */
  async read(declared: SimCfnTemplateValue): Promise<string> {
    const location = this.location(declared);
    const definition = await this.#definitions.read(location);

    if (definition === undefined) {
      throw simCfnStepFunctionsSkippedResourceError(
        stateMachineResourceType,
        this.#logicalId,
        `${definitionS3LocationPropertyName} points at ` +
          `s3://${location.bucketName}/${location.objectKey}, and this ` +
          "simulation holds no object there",
      );
    }

    return definition;
  }

  /**
   * The bucket and key the property names.
   */
  private location(declared: SimCfnTemplateValue): SimStatesDefinitionLocation {
    if (!isRecord(declared)) {
      throw this.error(`${definitionS3LocationPropertyName} must be an object`);
    }

    return {
      bucketName: this.member(declared["Bucket"], "Bucket"),
      objectKey: this.member(declared["Key"], "Key"),
    };
  }

  /**
   * One member of the location, which has to be a string that is there.
   */
  private member(value: SimCfnTemplateValue | undefined, name: string): string {
    if (typeof value !== "string" || value === "") {
      throw this.error(
        `${definitionS3LocationPropertyName}.${name} must be a string naming ` +
          "where the definition is",
      );
    }

    return value;
  }

  private error(reason: string): Error {
    return simCfnStepFunctionsResourceError(
      stateMachineResourceType,
      this.#logicalId,
      reason,
    );
  }
}
