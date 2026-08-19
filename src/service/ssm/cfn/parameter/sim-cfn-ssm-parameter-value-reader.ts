import type {
  SimCfnParameterStoreReader,
  SimCfnParameterStoreValue,
} from "../../../cloudformation/parameters/store/sim-cfn-parameter-store.type.js";
import type { SimSsm } from "../../sim-ssm.js";

interface SimCfnSsmParameterValueReaderProperties {
  readonly ssm: SimSsm;
}

/**
 * Answers an `AWS::SSM::Parameter::Value<...>` template Parameter from the
 * simulated Parameter Store.
 *
 * The Parameter is given a parameter name and resolves to the current value
 * held under it, as real CloudFormation resolves one while it reads the
 * template's `Parameters` section. Nothing in the Stack has been created at
 * that point, so a name another Resource of the same Stack goes on to create
 * is a name this cannot answer.
 *
 * A name with nothing behind it becomes a stand-in value carrying a reason,
 * which the Stack records. A template reading configuration a test never
 * created still deploys everything else in it.
 */
export class SimCfnSsmParameterValueReader implements SimCfnParameterStoreReader {
  private readonly ssm: SimSsm;

  constructor(properties: SimCfnSsmParameterValueReaderProperties) {
    this.ssm = properties.ssm;
  }

  /**
   * Read the current value of one parameter.
   */
  read(name: string): SimCfnParameterStoreValue {
    const parameter = this.ssm.findParameter(name);

    if (parameter === undefined) {
      return this.standIn(
        name,
        `which simulated Parameter Store holds no parameter of`,
      );
    }

    if (parameter.type.value === "SecureString") {
      return this.standIn(
        name,
        `which is a SecureString, a type real CloudFormation refuses to read ` +
          `into a template Parameter`,
      );
    }

    return { value: parameter.currentVersion.value.value };
  }

  /**
   * The value a name Parameter Store could not answer resolves to.
   *
   * The shape follows the one a dynamic reference stands in with, so a test
   * reading either back sees where the value came from.
   */
  private standIn(name: string, reason: string): SimCfnParameterStoreValue {
    return {
      value: `dummy-value-for-${name}`,
      reason:
        `names the Parameter Store parameter '${name}', ${reason}, so the ` +
        `Parameter resolves to a stand-in value`,
    };
  }
}
