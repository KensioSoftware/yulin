import {
  assertDefined,
  assertNotNull,
} from "../../../../util/type-guard/defined.js";
import type {
  SimCfnCfBinding,
  SimCfnExecutableResourceBinding,
} from "../../../cloudformation/bind/sim-cfn-exec-binding.type.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { makeCffFunctionCodeInput } from "../../cff/function-code-input/cff-function-code-input.js";
import {
  simCfnCffFunctionConfig,
  type SimCfnCffFunctionConfig,
} from "./sim-cfn-cff-function-config.js";

interface SimCfnCfFunctionCreateInputBuilderProps {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
}

interface SimCfnCfFunctionCreateInput {
  readonly Name: string;
  readonly FunctionCode: Buffer | ReturnType<typeof makeCffFunctionCodeInput>;
  readonly FunctionConfig?: SimCfnCffFunctionConfig | undefined;
}

/**
 * Translates an AWS::CloudFront::Function Resource into the input expected by
 * the simulated CloudFront CreateFunction command.
 *
 * This builder owns only the Resource-property-to-command-input translation:
 *
 * - require FunctionCode and ensure it is a string
 * - derive the CloudFront Function name from Name, or fall back to the
 *   CloudFormation logical ID
 * - replace FunctionCode with an executable test/runtime binding when one
 *   matches this Resource
 * - delegate optional FunctionConfig parsing to simCfnCffFunctionConfig
 *
 * It does not call sim CloudFront or inspect the created Function.
 * SimCfnCffCreator owns those Resource lifecycle steps.
 */
export class SimCfnCffCreateInputBuilder {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly bindings:
    readonly SimCfnExecutableResourceBinding[] | undefined;

  constructor(props: SimCfnCfFunctionCreateInputBuilderProps) {
    this.resource = props.resource;
    this.properties = props.properties;
    this.bindings = props.bindings;
  }

  /**
   * Build the minimal CreateFunction input used by the simulated CloudFront
   * service.
   *
   * CloudFormation FunctionCode is normally plain source text and is converted
   * to a Buffer. If an executable binding matches this Resource, the binding's
   * handler is used instead so tests can execute real JavaScript handlers while
   * still declaring the Function through CloudFormation.
   */
  build(): SimCfnCfFunctionCreateInput {
    const functionCodeValue = this.functionCode();
    const functionName = this.functionName();
    const binding = this.findBinding(functionName);

    return {
      Name: functionName,
      FunctionCode:
        binding === undefined
          ? Buffer.from(functionCodeValue)
          : makeCffFunctionCodeInput(binding.handler),
      FunctionConfig: simCfnCffFunctionConfig(
        this.properties["FunctionConfig"],
      ),
    };
  }

  /**
   * Read the required FunctionCode Resource property.
   *
   * CloudFormation requires this property for AWS::CloudFront::Function. The
   * simulator keeps that contract explicit here so invalid templates fail
   * before they reach the simulated CloudFront service.
   */
  private functionCode(): string {
    const functionCodeValue = this.properties["FunctionCode"];

    assertDefined(
      functionCodeValue,
      `AWS::CloudFront::Function ${this.resource.logicalId} FunctionCode`,
    );
    assertNotNull(
      functionCodeValue,
      `AWS::CloudFront::Function ${this.resource.logicalId} FunctionCode`,
    );

    if (typeof functionCodeValue !== "string") {
      throw new TypeError(
        `AWS::CloudFront::Function ${this.resource.logicalId} FunctionCode must be a string`,
      );
    }

    return functionCodeValue;
  }

  /**
   * Resolve the CloudFront Function name for creation.
   *
   * AWS::CloudFront::Function supports an optional Name property. When it is
   * not provided, the simulator uses the Resource logical ID as a predictable
   * local fallback.
   */
  private functionName(): string {
    const nameValue = this.properties["Name"];

    return typeof nameValue === "string" && nameValue.length > 0
      ? nameValue
      : this.resource.logicalId;
  }

  /**
   * Find an executable binding for this Function Resource.
   *
   * Bindings may target either the CloudFormation logical ID or the resolved
   * CloudFront Function name. Logical ID matching is checked first because it
   * is stable even when the template omits the Name property and the name is
   * derived by this builder.
   */
  private findBinding(functionName: string): SimCfnCfBinding | undefined {
    return this.bindings?.find((binding) => {
      if ("logicalId" in binding) {
        return binding.logicalId === this.resource.logicalId;
      }

      if ("functionName" in binding) {
        return binding.functionName === functionName;
      }

      /* v8 ignore next */
      return false;
    }) as SimCfnCfBinding | undefined;
  }
}
