import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import type { SimCfnParameterStoreReader } from "./store/sim-cfn-parameter-store.type.js";

/**
 * Runtime value for a CloudFormation Parameter after command input, template
 * defaults and Parameter Store reads have been applied.
 *
 * A Parameter is given its value as a string, because AWS CloudFormation
 * command inputs provide ParameterValue as one. A Parameter declared as
 * `AWS::SSM::Parameter::Value<List<String>>` is given a parameter name and
 * resolves to the stored value split into a list, so a resolved value can be
 * either.
 */
export type SimCloudFormationParameterValue = string | string[];

/**
 * The Parameter values a command supplied, keyed by Parameter name.
 */
export type SimCloudFormationParameterValues = Record<string, string>;

/**
 * Minimal structural shape accepted from CloudFormation command inputs.
 *
 * This models only the Parameters collection used by
 * create/update style commands, rather than a complete AWS SDK command input
 * type.
 */
export interface SimCloudFormationParameterInput {
  readonly Parameters?:
    | readonly {
        readonly ParameterKey?: string | undefined;
        readonly ParameterValue?: string | undefined;
      }[]
    | undefined;
}

/**
 * Construction options for the Parameters wrapper.
 *
 * Definitions come from a template Parameters section, while values come from
 * command input or already-normalized test/setup data.
 */
export interface SimCfnParametersProperties {
  readonly definitions?: Record<string, SimCfnParameterDefinition> | undefined;
  readonly values?: SimCloudFormationParameterValues | undefined;
  readonly stackName?: string | undefined;

  /**
   * The simulated Parameter Store that a Parameter typed as one of its values
   * is read from.
   *
   * Absent where a template is resolved outside a simulation, which leaves
   * such a Parameter resolving to the name it was given.
   */
  readonly parameterStore?: SimCfnParameterStoreReader | undefined;
}

/**
 * What a Parameters wrapper is given about the Stack it belongs to.
 *
 * Everything but the values. A caller with command input to normalize passes
 * the values separately, and a caller reading a template Parameters section has
 * none to pass at all.
 */
export type SimCfnParametersContext = Pick<
  SimCfnParametersProperties,
  "definitions" | "stackName" | "parameterStore"
>;

/**
 * Minimal CloudFormation template Parameter definition understood by the
 * simulator.
 *
 * Most fields are recorded for structural typing/documentation. Runtime
 * behavior applies string Default values when a command does not provide an
 * explicit Parameter value, and reads an `AWS::SSM::Parameter::Value<...>`
 * Type from simulated Parameter Store.
 */
export interface SimCfnParameterDefinition {
  readonly Type?: string | undefined;
  readonly Default?: SimCfnTemplateValue | undefined;
  readonly Description?: string | undefined;
  readonly AllowedValues?: readonly SimCfnTemplateValue[] | undefined;
  readonly AllowedPattern?: string | undefined;
  readonly ConstraintDescription?: string | undefined;
  readonly MinLength?: number | undefined;
  readonly MaxLength?: number | undefined;
  readonly MinValue?: number | undefined;
  readonly MaxValue?: number | undefined;
  readonly NoEcho?: boolean | undefined;
}
