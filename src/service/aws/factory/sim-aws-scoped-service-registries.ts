import { SimAcmRegistry } from "../../acm/registry/sim-acm-registry.js";
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
