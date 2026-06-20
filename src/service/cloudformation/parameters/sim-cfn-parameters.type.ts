import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";

/**
 * Runtime value for a CloudFormation Parameter after command input and template
 * defaults have been applied.
 *
 * The simulator currently supports string Parameter values because AWS
 * CloudFormation command inputs provide ParameterValue as a string.
 */
export type SimCloudFormationParameterValue = string;

/**
 * Normalized Parameter values keyed by CloudFormation Parameter name.
 */
export type SimCloudFormationParameterValues = Record<
  string,
  SimCloudFormationParameterValue
>;

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
export interface SimCfnParametersProps {
  readonly definitions?: Record<string, SimCfnParameterDefinition> | undefined;
  readonly values?: SimCloudFormationParameterValues | undefined;
  readonly stackName?: string | undefined;
}

/**
 * Minimal CloudFormation template Parameter definition understood by the
 * simulator.
 *
 * Most fields are recorded for structural typing/documentation. Runtime
 * behavior currently only applies string Default values when a command does not
 * provide an explicit Parameter value.
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
