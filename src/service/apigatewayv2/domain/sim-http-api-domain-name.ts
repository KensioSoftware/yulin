import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimApiMappingStore } from "./sim-api-mapping-store.js";

/**
 * The expression API Gateway selects an API mapping with, which is the request
 * base path and is the only value the v2 API reports.
 */
export const simApiMappingSelectionExpression = "$request.basepath";

/**
 * One entry of a domain's `DomainNameConfigurations`, as it was written.
 *
 * Nothing here is applied. A simulated request arrives over plain HTTP on
 * localhost, so a certificate and a TLS security policy have nothing to decide.
 * They are kept so a test can assert the domain was configured with the
 * certificate the stack meant to give it.
 */
export interface SimHttpApiDomainNameConfiguration {
  CertificateArn?: string | undefined;
  CertificateName?: string | undefined;
  EndpointType?: string | undefined;
  SecurityPolicy?: string | undefined;
}

/**
 * Minimal structural domain name view, as the Create and Get commands return.
 */
export interface SimHttpApiDomainNameView {
  DomainName: string;
  ApiMappingSelectionExpression: string;
  DomainNameConfigurations: readonly SimHttpApiDomainNameConfiguration[];
}

interface SimHttpApiDomainNameProperties {
  readonly domainName: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly configurations: readonly SimHttpApiDomainNameConfiguration[];
}

/**
 * A simulated API Gateway custom domain name.
 *
 * The domain answers on a hostname of its own rather than on one API Gateway
 * generated, which is how an HTTP API is reached under a name the project
 * owns. It owns its API mappings, because a mapping is addressed by domain on
 * real AWS and none of them outlives the domain.
 *
 * A domain and the APIs it maps live in one Account and Region, as they do on
 * real AWS, so a mapping names an API id and nothing more.
 */
export class SimHttpApiDomainName {
  public readonly domainName: string;
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly configurations: readonly SimHttpApiDomainNameConfiguration[];
  public readonly apiMappings = new SimApiMappingStore();

  constructor(properties: SimHttpApiDomainNameProperties) {
    this.domainName = properties.domainName;
    this.accountRegionScope = properties.accountRegionScope;
    this.configurations = properties.configurations;
  }

  /**
   * The hostname this domain answers requests on.
   */
  get hostname(): string {
    return this.domainName;
  }

  /**
   * Get the AWS-like view of this domain name.
   */
  view(): SimHttpApiDomainNameView {
    return {
      DomainName: this.domainName,
      ApiMappingSelectionExpression: simApiMappingSelectionExpression,
      DomainNameConfigurations: this.configurations.map((configuration) => ({
        ...configuration,
      })),
    };
  }
}
