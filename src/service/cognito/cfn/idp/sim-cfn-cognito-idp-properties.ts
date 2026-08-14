import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateIdentityProviderCommandInput } from "../../command/idp/identity-provider.command.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The AWS::Cognito::UserPoolIdentityProvider properties this simulation
 * deploys, which are all of them.
 */
const simulatedProperties = [
  "UserPoolId",
  "ProviderName",
  "ProviderType",
  "ProviderDetails",
  "AttributeMapping",
  "IdpIdentifiers",
];

interface SimCfnCognitoIdpPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Cognito::UserPoolIdentityProvider CloudFormation properties into
 * the CreateIdentityProvider input the provider creator needs.
 */
export class SimCfnCognitoIdpProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnCognitoPropertyParser({
    resourceType: "AWS::Cognito::UserPoolIdentityProvider",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnCognitoIdpPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The pool this provider belongs to, which a template reaches with a `Ref`
   * on its AWS::Cognito::UserPool.
   */
  userPoolId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["UserPoolId"],
      "UserPoolId",
    );
  }

  /**
   * The provider's name, which is also what a `Ref` on this Resource returns.
   */
  providerName(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["ProviderName"],
      "ProviderName",
    );
  }

  /**
   * The CreateIdentityProvider input this Resource asks for.
   */
  createIdentityProviderInput(): SimCreateIdentityProviderCommandInput {
    return {
      UserPoolId: this.userPoolId(),
      ProviderName: this.providerName(),
      ProviderType: this.propertyParser.requiredString(
        this.resource,
        this.properties["ProviderType"],
        "ProviderType",
      ),
      ProviderDetails: this.stringRecord(
        this.properties["ProviderDetails"],
        "ProviderDetails",
      ),
      AttributeMapping: this.stringRecord(
        this.properties["AttributeMapping"],
        "AttributeMapping",
      ),
      IdpIdentifiers: this.propertyParser.optionalStringArray(
        this.resource,
        this.properties["IdpIdentifiers"],
        "IdpIdentifiers",
      ),
    };
  }

  /**
   * A property that is a map of strings to strings.
   *
   * CloudFormation carries every value as a string, and both of these
   * properties are string maps on real Cognito too, so each entry is read as
   * one rather than being passed through as it stands.
   */
  private stringRecord(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): Readonly<Record<string, string>> | undefined {
    const record = this.propertyParser.optionalRecord(
      this.resource,
      value,
      label,
    );

    if (record === undefined) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [
        key,
        this.propertyParser.requiredString(
          this.resource,
          entry,
          `${label} ${key}`,
        ),
      ]),
    );
  }
}
