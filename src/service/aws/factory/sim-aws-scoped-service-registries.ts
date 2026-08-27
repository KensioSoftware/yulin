import { SimAcmRegistry } from "../../acm/registry/sim-acm-registry.js";
import { SimRestApiRegistry } from "../../apigateway/registry/sim-rest-api-registry.js";
import { SimHttpApiDomainRegistry } from "../../apigatewayv2/registry/sim-http-api-domain-registry.js";
import { SimHttpApiRegistry } from "../../apigatewayv2/registry/sim-http-api-registry.js";
import { SimCognitoDomainRegistry } from "../../cognito/registry/sim-cognito-domain-registry.js";
import { SimCognitoUserPoolRegistry } from "../../cognito/registry/sim-cognito-user-pool-registry.js";
import { SimEcrRegistry } from "../../ecr/registry/sim-ecr-registry.js";
import { SimElbV2Registry } from "../../elbv2/registry/sim-elbv2-registry.js";
import { SimKmsRegistry } from "../../kms/registry/sim-kms-registry.js";
import { SimRoute53Registry } from "../../route53/registry/sim-route53-registry.js";
import { SimS3GlobalRegistry } from "../../s3/sim-s3-global-registry.js";
import { SimAwsHostnameClaims } from "../../../serve/controller/host/sim-aws-hostname-claims.js";
import {
  SimAwsAnyServiceHosts,
  type SimAwsServiceHosts,
} from "../../../serve/controller/host/sim-aws-service-hosts.js";

/**
 * The registries one simulation's scoped services share between them.
 *
 * Each of these exists because a service instance is scoped to an account, or
 * an account and region, while the thing it indexes is not. Gathering them
 * here keeps the service factory about creating services rather than about
 * what has to outlive one scope.
 */
export class SimAwsScopedServiceRegistries {
  /**
   * Indexes the account/region-scoped ACM facades created for one SimAws
   * instance, so services holding only a Certificate ARN, such as CloudFront,
   * can resolve the Certificate it names.
   */
  public readonly acm = new SimAcmRegistry();

  /**
   * Indexes the user pools created in any Account and Region of one SimAws
   * instance, so a served request naming only a pool id, such as one for a
   * pool's JWKS, finds the pool it belongs to.
   */
  public readonly cognito = new SimCognitoUserPoolRegistry();

  /**
   * Indexes the hosted domains created in any Account and Region of one SimAws
   * instance. A domain is unique across the whole of AWS rather than within an
   * Account, and a request to one carries only a hostname, so this is also
   * where DNS resolution finds the pool a hosted request is for.
   */
  public readonly cognitoDomains: SimCognitoDomainRegistry;

  /**
   * Indexes the repositories created in any Account and Region of one SimAws
   * instance, so a container image function holding only an image URI finds
   * the repository that URI names, whichever Account and Region it is in.
   */
  public readonly ecr = new SimEcrRegistry();

  /**
   * Indexes the load balancers created in any Account and Region of one SimAws
   * instance by the DNS name they answer on. A request reaching one carries
   * that name and no Account, so this is the hop from a host name to the scope
   * holding the load balancer.
   */
  public readonly elbV2 = new SimElbV2Registry();

  /**
   * Indexes the API ids allocated in any Account and Region of one SimAws
   * instance. A served request carries its Region in the host name and no
   * Account, so this is what gets the serving layer from an API id to the
   * scope that owns it.
   */
  public readonly httpApi = new SimHttpApiRegistry();

  /**
   * Indexes the custom domain names created in any Account and Region of one
   * SimAws instance. A domain name is unique across the whole of AWS rather
   * than within an Account, and a request to one carries only a hostname, so
   * this is also where DNS resolution finds the domain a request arrived at.
   */
  public readonly httpApiDomains: SimHttpApiDomainRegistry;

  /**
   * Indexes the REST API ids allocated in any Account and Region of one SimAws
   * instance, the way `httpApi` does for HTTP APIs. The two services issue
   * endpoints under the same `execute-api` host, and a served request carries
   * no Account, so each keeps the hop from an id to the scope owning it.
   */
  public readonly restApi = new SimRestApiRegistry();

  /**
   * Indexes the account/region-scoped KMS facades created for one SimAws
   * instance, so services holding only a key ARN, such as Route53 DNSSEC, can
   * resolve the key it names.
   */
  public readonly kms = new SimKmsRegistry();

  /**
   * Owns hosted zone and DNS record state shared by the account-scoped Route53
   * service instances created for one SimAws instance.
   */
  public readonly route53 = new SimRoute53Registry();

  /**
   * Tracks Bucket ownership across account and region scopes for one SimAws
   * instance, so region-scoped S3 service instances can enforce the
   * cross-region uniqueness and lookup behaviour of S3 Bucket names.
   */
  public readonly s3 = new SimS3GlobalRegistry();

  /**
   * Where a hostname a resource claimed for itself is looked up, which is what
   * simulated DNS resolution asks after the built-in hostname shapes.
   */
  public readonly serviceHosts: SimAwsServiceHosts;

  /**
   * Where a hostname a hosted-zone record outranks is looked up. An API
   * Gateway custom domain name is reached through a record on AWS, so a record
   * for one decides where the name goes and the domain answers where no record
   * names it.
   */
  public readonly shadowableServiceHosts: SimAwsServiceHosts;

  /**
   * The hostnames the domain registries have handed out. A public hostname is
   * unique across the whole of AWS rather than within one service, so the two
   * services that hand them out share this rather than each keeping its own.
   */
  private readonly hostnameClaims = new SimAwsHostnameClaims();

  constructor() {
    this.cognitoDomains = new SimCognitoDomainRegistry(this.hostnameClaims);
    this.httpApiDomains = new SimHttpApiDomainRegistry(this.hostnameClaims);
    this.serviceHosts = new SimAwsAnyServiceHosts([this.cognitoDomains]);
    this.shadowableServiceHosts = new SimAwsAnyServiceHosts([
      this.httpApiDomains,
    ]);
  }
}
