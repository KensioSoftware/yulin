import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimCognitoAccountRecoverySettingType,
  SimCognitoRecoveryOptionType,
} from "../../user-pool/sim-cognito-account-recovery.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The `AccountRecoverySetting` fields this simulation reads, which is the one
 * field it has.
 */
const modelledFields = ["RecoveryMechanisms"];

interface SimCfnCognitoAccountRecoveryProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `AccountRecoverySetting` property of an AWS::Cognito::UserPool
 * Resource into the shape CreateUserPool takes.
 *
 * A mechanism carries a name and a priority, and both are read. The names are
 * passed on rather than judged here: CreateUserPool refuses one Cognito does
 * not have, so a template asking for it fails the stack with the same words an
 * SDK caller would have been given.
 */
export class SimCfnCognitoAccountRecovery {
  private readonly resource: SimCfnResource;
  private readonly parser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoAccountRecoveryProperties) {
    this.resource = properties.resource;
    this.parser = properties.propertyParser;
  }

  /**
   * The recovery the template declares, or undefined where it declares none.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): SimCognitoAccountRecoverySettingType | undefined {
    const setting = this.parser.optionalRecord(
      this.resource,
      value,
      "AccountRecoverySetting",
    );

    if (setting === undefined) {
      return undefined;
    }

    this.parser.ignoreUnmodelledKeys(
      this.resource,
      setting,
      modelledFields,
      "AccountRecoverySetting ",
    );

    return {
      RecoveryMechanisms: this.mechanisms(setting["RecoveryMechanisms"]),
    };
  }

  /**
   * The mechanisms the setting lists, in the order it lists them.
   */
  private mechanisms(
    listed: SimCfnTemplateValue | undefined,
  ): readonly SimCognitoRecoveryOptionType[] {
    if (listed === undefined) {
      return [];
    }

    if (!Array.isArray(listed)) {
      throw this.parser.invalidPropertyError(
        this.resource,
        "AccountRecoverySetting RecoveryMechanisms",
        "a list of recovery mechanisms",
      );
    }

    return listed.map((entry, index) => {
      const label = `RecoveryMechanisms[${String(index)}]`;
      const mechanism = this.parser.optionalRecord(this.resource, entry, label);

      // A list entry is always something, so the parser above has either
      // answered with the object or refused whatever else the template wrote.
      assertDefined(mechanism, label);

      return {
        Name: this.parser.optionalString(
          this.resource,
          mechanism["Name"],
          `${label} Name`,
        ),
        Priority: this.parser.optionalNumber(
          this.resource,
          mechanism["Priority"],
          `${label} Priority`,
        ),
      };
    });
  }
}
