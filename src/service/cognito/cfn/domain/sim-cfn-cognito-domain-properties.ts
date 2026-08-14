import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateUserPoolDomainCommandInput } from "../../command/domain/user-pool-domain.command.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The AWS::Cognito::UserPoolDomain properties this simulation deploys, which
 * are all of them.
 */
const simulatedProperties = [
  "UserPoolId",
  "Domain",
  "CustomDomainConfig",
  "ManagedLoginVersion",
];

interface SimCfnCognitoDomainPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Cognito::UserPoolDomain CloudFormation properties into the
 * CreateUserPoolDomain input the domain creator needs.
 */
export class SimCfnCognitoDomainProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnCognitoPropertyParser({
    resourceType: "AWS::Cognito::UserPoolDomain",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnCognitoDomainPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The pool this domain belongs to, which a template reaches with a `Ref` on
   * its AWS::Cognito::UserPool.
   */
  userPoolId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["UserPoolId"],
      "UserPoolId",
    );
  }

  /**
   * The domain string, which is also what a `Ref` on this Resource returns.
   */
  domain(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["Domain"],
      "Domain",
    );
  }

  /**
   * The CreateUserPoolDomain input this Resource asks for.
   */
  createUserPoolDomainInput(): SimCreateUserPoolDomainCommandInput {
    return {
      UserPoolId: this.userPoolId(),
      Domain: this.domain(),
      CustomDomainConfig: this.customDomainConfig(),
      ManagedLoginVersion: this.propertyParser.optionalNumber(
        this.resource,
        this.properties["ManagedLoginVersion"],
        "ManagedLoginVersion",
      ),
    };
  }

  /**
   * The certificate a custom domain is served with, for a template that names
   * one. A template naming none is asking for a Cognito prefix domain.
   */
  private customDomainConfig(): SimCreateUserPoolDomainCommandInput["CustomDomainConfig"] {
    const config: SimCfnTemplateValue | undefined =
      this.properties["CustomDomainConfig"];

    if (config === undefined) {
      return undefined;
    }

    const record =
      this.propertyParser.optionalRecord(
        this.resource,
        config,
        "CustomDomainConfig",
      ) ?? {};

    return {
      CertificateArn: this.propertyParser.optionalString(
        this.resource,
        record["CertificateArn"],
        "CustomDomainConfig CertificateArn",
      ),
    };
  }
}
