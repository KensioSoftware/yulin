import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import type { SimAcmRegistry } from "../../acm/registry/sim-acm-registry.js";
import type { SimCloudFrontRegistry } from "../../cloudfront/registry/sim-cloud-front-registry.js";
import { makeSimCfS3OriginResolver } from "../../cloudfront/origin/s3/sim-cf-s3-origin-resolver-factory.js";
import { makeSimCfCustomOriginDispatcher } from "../../cloudfront/origin/custom/sim-cf-custom-origin-dispatcher.factory.js";
import { SimCloudFront } from "../../cloudfront/sim-cloudfront.js";
import { SimAwsCfEdgeFunctions } from "../../cloudfront/edge/sim-aws-cf-edge-functions.js";
import { makeSimCfWebAclResolver } from "../../cloudfront/web-acl/sim-cf-web-acl-resolver.factory.js";
import { SimRoute53 } from "../../route53/index.js";
import type { SimRoute53Registry } from "../../route53/registry/sim-route53-registry.js";
import type { SimKmsRegistry } from "../../kms/registry/sim-kms-registry.js";
import { SimIam } from "../../iam/index.js";
import type { SimIamRegistry } from "../../iam/registry/sim-iam-registry.js";
import type { SimIamServiceControlPolicyResolver } from "../../iam/authorize/scp/sim-iam-scp-resolver.js";
import {
  SimIamAccountAccessKeyIndex,
  type SimIamAccessKeyRegistry,
} from "../../iam/registry/sim-iam-access-key-registry.js";
import type { SimAwsServiceHosts } from "../../../serve/controller/host/sim-aws-service-hosts.js";
import { SimIamCredentialRegistry } from "../../iam/credential/sim-iam-credential-registry.js";
import { Memo } from "../../../util/memo/memo.js";
import { accountServiceCacheKey } from "./account-service-cache-key.js";
import type { SimAwsScopedServiceProperties } from "./sim-aws-scoped-service-properties.js";

interface SimAwsAccountServiceCacheProperties {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly acmRegistry: SimAcmRegistry;
  readonly cloudFrontRegistry: SimCloudFrontRegistry;
  readonly route53Registry: SimRoute53Registry;
  readonly kmsRegistry: SimKmsRegistry;
  readonly serviceHosts: SimAwsServiceHosts;
  readonly shadowableServiceHosts: SimAwsServiceHosts;
  readonly iamRegistry: SimIamRegistry;
  readonly accessKeyRegistry: SimIamAccessKeyRegistry;
  readonly scpResolver: SimIamServiceControlPolicyResolver;
}

/**
 * Account-level cache for simulated AWS service instances.
 *
 * SimAwsServiceFactory owns the top-level service construction policy and the
 * shared registries for one SimAws instance. This class is the narrower cache
 * it delegates to for services whose AWS state is scoped to an account rather
 * than to an account/region pair, as SimAwsAccountRegionServiceBuilder is the
 * one it delegates to for the rest.
 *
 * This class is the account-scoped service catalog: it records which simulated
 * AWS services share one instance across all regions in an account. A single
 * Memo stores those instances by service/account keys, so adding another
 * account-scoped service does not require a new Map or another repeated
 * get/create/store block.
 *
 * Each create method returns the same simulated service instance for repeated
 * requests in the same account, regardless of the requested region. This
 * matches global/account-scoped AWS services such as IAM, Route53, and
 * CloudFront while keeping those lifetime rules out of the top-level
 * SimAwsServiceFactory.
 */
export class SimAwsAccountServiceCache {
  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly acmRegistry: SimAcmRegistry;
  private readonly cloudFrontRegistry: SimCloudFrontRegistry;
  private readonly iamRegistry: SimIamRegistry;
  private readonly accessKeyRegistry: SimIamAccessKeyRegistry;
  private readonly scpResolver: SimIamServiceControlPolicyResolver;
  private readonly route53Registry: SimRoute53Registry;
  private readonly kmsRegistry: SimKmsRegistry;
  private readonly serviceHosts: SimAwsServiceHosts;
  private readonly shadowableServiceHosts: SimAwsServiceHosts;

  /**
   * Shared memo for account-scoped service instances.
   *
   * The cache key includes both service name and account ID. The account ID gives
   * account-scoped lifetime, while the service name prevents different services
   * in the same account from colliding in this single memo.
   */
  private readonly services = new Memo<SimCloudFront | SimIam | SimRoute53>();

  constructor(properties: SimAwsAccountServiceCacheProperties) {
    this.simAws = properties.simAws;
    this.background = properties.background;
    this.acmRegistry = properties.acmRegistry;
    this.cloudFrontRegistry = properties.cloudFrontRegistry;
    this.iamRegistry = properties.iamRegistry;
    this.scpResolver = properties.scpResolver;
    this.accessKeyRegistry = properties.accessKeyRegistry;
    this.route53Registry = properties.route53Registry;
    this.kmsRegistry = properties.kmsRegistry;
    this.serviceHosts = properties.serviceHosts;
    this.shadowableServiceHosts = properties.shadowableServiceHosts;
  }

  /**
   * The collaborators every Account/Region scoped service takes.
   *
   * It is assembled here because the IAM in it is the Account's one IAM, which
   * is what makes a Region's services decide against it rather than against
   * one of their own.
   */
  scopedServiceProperties(
    scope: SimAwsAccountRegionContainer,
  ): SimAwsScopedServiceProperties {
    return {
      accountRegionScope: scope.accountRegionScope,
      iam: this.createIam(scope),
      background: this.background,
    };
  }

  /**
   * Create or get simulated CloudFront for an Account scope.
   */
  createCloudFront(scope: SimAwsAccountRegionContainer): SimCloudFront {
    const iam = this.createIam(scope);

    return this.services.getOrCreate(
      accountServiceCacheKey("cloudFront", scope.accountRegionScope.accountId),
      () =>
        new SimCloudFront({
          accountRegionScope: scope.accountRegionScope,
          cloudFrontRegistry: this.cloudFrontRegistry,
          s3OriginResolver: makeSimCfS3OriginResolver(this.simAws),
          customOriginDispatcher: makeSimCfCustomOriginDispatcher(this.simAws),
          iam,
          acmRegistry: this.acmRegistry,
          // A CLOUDFRONT scope web ACL is held by the WAFv2 of the Account and
          // Region its ARN names, which CloudFront reaches through the
          // simulation rather than holding itself.
          webAclResolver: makeSimCfWebAclResolver(this.simAws),
          // A Lambda@Edge function lives in us-east-1 and is named by ARN, so
          // CloudFront reaches it through the simulation rather than through
          // the Lambda of its own scope.
          edgeFunctions: new SimAwsCfEdgeFunctions(this.simAws),
          background: this.background,
        }),
    );
  }

  /**
   * Create or get simulated IAM for an Account scope.
   */
  createIam(scope: SimAwsAccountRegionContainer): SimIam {
    return this.services.getOrCreate(
      accountServiceCacheKey("iam", scope.accountRegionScope.accountId),
      () => {
        const iam = new SimIam({
          accountRegionScope: scope.accountRegionScope,
          background: this.background,
          // A cross-Account request is decided in both Accounts, so this IAM
          // needs to be able to reach the IAM of the caller's own Account.
          iamResolver: this.iamRegistry,
          // What the Account's organization allows it to do is decided outside
          // the Account, so IAM asks simulated Organizations about it.
          scpResolver: this.scpResolver,
          // Access keys are indexed simulation-wide as they are issued, so a
          // signed request naming only a key id can be traced to this Account.
          credentialRegistry: new SimIamCredentialRegistry({
            clock: this.background,
            accessKeyIndex: new SimIamAccountAccessKeyIndex(
              this.accessKeyRegistry,
              scope.accountRegionScope.accountId,
            ),
          }),
        });

        this.iamRegistry.register(scope.accountRegionScope.accountId, iam);

        return iam;
      },
    );
  }

  /**
   * Create or get simulated Route53 for an Account scope.
   */
  createRoute53(scope: SimAwsAccountRegionContainer): SimRoute53 {
    const iam = this.createIam(scope);

    return this.services.getOrCreate(
      accountServiceCacheKey("route53", scope.accountRegionScope.accountId),
      () =>
        new SimRoute53({
          iam,
          background: this.background,
          route53Registry: this.route53Registry,
          serviceHosts: this.serviceHosts,
          shadowableServiceHosts: this.shadowableServiceHosts,
          // A DNSSEC key-signing key names a KMS key by ARN, in whichever
          // Region holds it, so Route53 resolves it through the registry.
          kmsKeys: this.kmsRegistry,
        }),
    );
  }
}
