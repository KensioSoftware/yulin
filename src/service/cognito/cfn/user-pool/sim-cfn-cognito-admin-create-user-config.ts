import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoAdminCreateUserConfigType } from "../../user-pool/sim-cognito-admin-create-user-config.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The `AdminCreateUserConfig` fields this simulation reads, which are all of
 * them.
 *
 * The two beside `AllowAdminCreateUserOnly` are read so that CreateUserPool
 * can refuse them in words that say why, rather than having them dropped
 * silently on the way.
 */
const modelledFields = [
  "AllowAdminCreateUserOnly",
  "InviteMessageTemplate",
  "UnusedAccountValidityDays",
];

interface SimCfnCognitoAdminCreateUserConfigProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `AdminCreateUserConfig` property of an AWS::Cognito::UserPool
 * Resource into the shape CreateUserPool takes.
 *
 * `AllowAdminCreateUserOnly` is what a CDK `UserPool` sets from
 * `selfSignUpEnabled`, and is the property that decides whether `SignUp` works
 * against the deployed pool at all, so it is parsed as a boolean rather than
 * passed through as whatever the template carried.
 */
export class SimCfnCognitoAdminCreateUserConfig {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoAdminCreateUserConfigProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The pool's admin creation configuration, or undefined when the template
   * names none.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): SimCognitoAdminCreateUserConfigType | undefined {
    const config = this.propertyParser.optionalRecord(
      this.resource,
      value,
      "AdminCreateUserConfig",
    );

    if (config === undefined) {
      return undefined;
    }

    this.propertyParser.ignoreUnmodelledKeys(
      this.resource,
      config,
      modelledFields,
      "AdminCreateUserConfig ",
    );

    return {
      AllowAdminCreateUserOnly: this.propertyParser.optionalBoolean(
        this.resource,
        config["AllowAdminCreateUserOnly"],
        "AdminCreateUserConfig AllowAdminCreateUserOnly",
      ),
      InviteMessageTemplate: this.propertyParser.optionalRecord(
        this.resource,
        config["InviteMessageTemplate"],
        "AdminCreateUserConfig InviteMessageTemplate",
      ),
      UnusedAccountValidityDays: this.propertyParser.optionalNumber(
        this.resource,
        config["UnusedAccountValidityDays"],
        "AdminCreateUserConfig UnusedAccountValidityDays",
      ),
    };
  }
}
