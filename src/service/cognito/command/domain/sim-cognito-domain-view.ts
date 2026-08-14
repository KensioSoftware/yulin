import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCognitoUserPoolDomain } from "../../user-pool/domain/sim-cognito-user-pool-domain.js";
import type { SimCognitoDomainDescriptionType } from "./user-pool-domain.command.js";

/**
 * The status a domain this simulation holds is in.
 *
 * Real Cognito takes a minute to build a prefix domain and up to an hour to
 * distribute a custom domain's certificate, and reports `CREATING` until it is
 * done. Nothing here is built, so a domain is usable as soon as it exists.
 */
const activeStatus = "ACTIVE";

interface SimCognitoDomainViewProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a simulated user pool domain is reported back to a caller.
 */
export class SimCognitoDomainView {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimCognitoDomainViewProperties) {
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * A domain as `DescribeUserPoolDomain` reports it.
   */
  describe(domain: SimCognitoUserPoolDomain): SimCognitoDomainDescriptionType {
    return {
      UserPoolId: domain.userPoolId,
      AWSAccountId: this.accountRegionScope.accountId,
      Domain: domain.value,
      Status: activeStatus,
      ...(domain.cloudFrontDistribution !== undefined && {
        CloudFrontDistribution: domain.cloudFrontDistribution,
      }),
      ...(domain.customDomainConfig !== undefined && {
        CustomDomainConfig: domain.customDomainConfig.toOutput(),
      }),
      ...(domain.managedLoginVersion !== undefined && {
        ManagedLoginVersion: domain.managedLoginVersion,
      }),
    };
  }
}
