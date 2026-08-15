import { SimAcmRegistry } from "../../acm/registry/sim-acm-registry.js";
import { SimCognitoDomainRegistry } from "../../cognito/registry/sim-cognito-domain-registry.js";
import { SimCognitoUserPoolRegistry } from "../../cognito/registry/sim-cognito-user-pool-registry.js";
import { SimEcrRegistry } from "../../ecr/registry/sim-ecr-registry.js";
import { SimKmsRegistry } from "../../kms/registry/sim-kms-registry.js";
import { SimRoute53Registry } from "../../route53/registry/sim-route53-registry.js";
import { SimS3GlobalRegistry } from "../../s3/sim-s3-global-registry.js";

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
  public readonly cognitoDomains = new SimCognitoDomainRegistry();

  /**
   * Indexes the repositories created in any Account and Region of one SimAws
   * instance, so a container image function holding only an image URI finds
   * the repository that URI names, whichever Account and Region it is in.
   */
  public readonly ecr = new SimEcrRegistry();

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
}
