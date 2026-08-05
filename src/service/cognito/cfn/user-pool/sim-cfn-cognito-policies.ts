import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoUserPoolPoliciesType } from "../../user-pool/sim-cognito-password-policy.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoPasswordPolicy } from "./sim-cfn-cognito-password-policy.js";
import { SimCfnCognitoSignInPolicy } from "./sim-cfn-cognito-sign-in-policy.js";

/**
 * The `Policies` fields this simulation reads, which are all of them.
 */
const modelledFields = ["PasswordPolicy", "SignInPolicy"];

interface SimCfnCognitoPoliciesProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `Policies` property of an AWS::Cognito::UserPool Resource into the
 * shape CreateUserPool takes.
 *
 * The two policies inside it each have their own reader, because a password
 * policy is state this simulation keeps and a sign-in policy is one it
 * refuses.
 */
export class SimCfnCognitoPolicies {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoPoliciesProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The pool's policies, or undefined when the template names none.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): SimCognitoUserPoolPoliciesType | undefined {
    const policies = this.propertyParser.optionalRecord(
      this.resource,
      value,
      "Policies",
    );

    if (policies === undefined) {
      return undefined;
    }

    this.propertyParser.ignoreUnmodelledKeys(
      this.resource,
      policies,
      modelledFields,
      "Policies ",
    );

    const collaborators = {
      resource: this.resource,
      propertyParser: this.propertyParser,
    };

    return {
      PasswordPolicy: new SimCfnCognitoPasswordPolicy(collaborators).parse(
        policies["PasswordPolicy"],
      ),
      SignInPolicy: new SimCfnCognitoSignInPolicy(collaborators).parse(
        policies["SignInPolicy"],
      ),
    };
  }
}
