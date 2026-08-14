import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import type { SimCognitoUserPoolDomain } from "../../user-pool/domain/sim-cognito-user-pool-domain.js";
import { SimCfnCognitoDomainProperties } from "./sim-cfn-cognito-domain-properties.js";

interface SimCfnCognitoDomainCreatorProperties {
  readonly cognito: SimCognitoIdentityProvider;
}

/**
 * Creates simulated domains from AWS::Cognito::UserPoolDomain Resources.
 *
 * The domain goes through the ordinary CreateUserPoolDomain command, so a
 * template gets the same validation an SDK caller would: the domain string is
 * checked against the form the request asked for, a prefix already in use
 * anywhere in the simulation is refused, and a pool that already has a domain
 * is refused a second one.
 */
export class SimCfnCognitoDomainCreator {
  private readonly cognito: SimCognitoIdentityProvider;

  constructor(properties: SimCfnCognitoDomainCreatorProperties) {
    this.cognito = properties.cognito;
  }

  /**
   * Create a domain from an AWS::Cognito::UserPoolDomain Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimCognitoUserPoolDomain> {
    const domainProperties = new SimCfnCognitoDomainProperties({
      resource,
      properties,
    });

    await this.cognito.createUserPoolDomain({
      input: domainProperties.createUserPoolDomainInput(),
    });

    const domain = this.cognito.findUserPoolDomainInAnyAccount(
      domainProperties.domain(),
    );
    assertDefined(
      domain,
      `sim Cognito domain ${domainProperties.domain()} after CloudFormation ` +
        `creation`,
    );

    return domain;
  }
}
