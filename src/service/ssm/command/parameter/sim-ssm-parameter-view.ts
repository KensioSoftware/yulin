import type { SimSsmParameter } from "../../parameter/sim-ssm-parameter.js";
import type { SimSsmParameterVersion } from "../../parameter/sim-ssm-parameter-version.js";
import type {
  SimSsmParameterMetadata,
  SimSsmParameterOutput,
} from "./parameter.command.js";

/**
 * The tier every simulated parameter is in.
 *
 * The advanced tier is not simulated, so nothing here can be in it.
 */
export const standardTier = "Standard";

/**
 * Converts a stored parameter into the shapes Parameter Store reports it in.
 *
 * There are two, and the difference is the point: the value-carrying shape
 * that GetParameter returns, and the metadata-only shape that
 * DescribeParameters returns. Building both here keeps them agreeing about
 * everything they share.
 */
export class SimSsmParameterView {
  /**
   * The parameter shape that carries a value.
   *
   * The reported value is passed in rather than read off the version, because
   * a SecureString reads back as its ciphertext or its plaintext depending on
   * whether the request asked for decryption.
   *
   * `Selector` is only reported when the request asked for a version or a
   * label, as real Parameter Store only reports it then.
   */
  value(
    parameter: SimSsmParameter,
    version: SimSsmParameterVersion,
    reportedValue: string,
    selector?: string,
  ): SimSsmParameterOutput {
    return {
      ARN: parameter.arn.value,
      Name: parameter.name.value,
      Type: parameter.type.value,
      Value: reportedValue,
      Version: version.version,
      DataType: version.dataType,
      LastModifiedDate: version.lastModifiedDate,
      Selector: selector,
    };
  }

  /**
   * The parameter shape that carries no value.
   *
   * `Policies` is always empty because parameter policies are not simulated.
   */
  metadata(parameter: SimSsmParameter): SimSsmParameterMetadata {
    const version = parameter.currentVersion;

    return {
      ARN: parameter.arn.value,
      Name: parameter.name.value,
      Type: parameter.type.value,
      Version: version.version,
      DataType: version.dataType,
      Description: version.description,
      KeyId: version.keyId,
      LastModifiedDate: version.lastModifiedDate,
      LastModifiedUser: version.lastModifiedUser,
      Policies: [],
      Tier: standardTier,
    };
  }
}
