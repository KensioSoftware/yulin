import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountId } from "../sim-aws-account.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import type { SimCloudFrontRegistry } from "../../cloudfront/registry/sim-cloud-front-registry.js";
import { makeSimCfS3OriginResolver } from "../../cloudfront/origin/s3/sim-cf-s3-origin-resolver-factory.js";
import { SimCloudFront } from "../../cloudfront/sim-cloudfront.js";
import { SimRoute53 } from "../../route53/index.js";
import type { SimRoute53Registry } from "../../route53/registry/sim-route53-registry.js";
import { SimIam } from "../../iam/index.js";

interface SimAwsAccountServiceCacheProps {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly cloudFrontRegistry: SimCloudFrontRegistry;
  readonly route53Registry: SimRoute53Registry;
}

/**
 * Cache for simulated AWS services scoped by account.
 */
export class SimAwsAccountServiceCache {
  private readonly simAws: SimAws;
  // TODO: SimAwsAccountServiceCache sometimes uses its own background instance,
  // and sometimes has one passed in to methods. Should be unified.
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly cloudFrontRegistry: SimCloudFrontRegistry;
  private readonly iamServices = new Map<SimAwsAccountId, SimIam>();
  private readonly route53Registry: SimRoute53Registry;

  private readonly cloudFrontServices = new Map<
    SimAwsAccountId,
    SimCloudFront
  >();
  private readonly route53Services = new Map<SimAwsAccountId, SimRoute53>();

  constructor(props: SimAwsAccountServiceCacheProps) {
    this.simAws = props.simAws;
    this.background = props.background;
    this.cloudFrontRegistry = props.cloudFrontRegistry;
    this.route53Registry = props.route53Registry;
  }

  /**
   * Create or get simulated CloudFront for an Account scope.
   */
  createCloudFront(scope: SimAwsAccountRegionContainer): SimCloudFront {
    const { accountId } = scope.accountRegionScope;

    let cloudFront = this.cloudFrontServices.get(accountId);

    if (cloudFront === undefined) {
      cloudFront = new SimCloudFront({
        accountRegionScope: scope.accountRegionScope,
        cloudFrontRegistry: this.cloudFrontRegistry,
        s3OriginResolver: makeSimCfS3OriginResolver(this.simAws, scope),
        background: this.background,
      });
      this.cloudFrontServices.set(accountId, cloudFront);
    }

    return cloudFront;
  }

  /**
   * Create or get simulated IAM for an Account scope.
   */
  createIam(
    scope: SimAwsAccountRegionContainer,
    background: BackgroundScheduler,
  ): SimIam {
    const { accountId } = scope.accountRegionScope;

    let iam = this.iamServices.get(accountId);

    if (iam === undefined) {
      iam = new SimIam({
        accountRegionScope: scope.accountRegionScope,
        background,
      });
      this.iamServices.set(accountId, iam);
    }

    return iam;
  }

  /**
   * Create or get simulated Route53 for an Account scope.
   */
  createRoute53(scope: SimAwsAccountRegionContainer): SimRoute53 {
    const { accountId } = scope.accountRegionScope;

    let route53 = this.route53Services.get(accountId);

    if (route53 === undefined) {
      route53 = new SimRoute53({
        background: this.background,
        route53Registry: this.route53Registry,
      });
      this.route53Services.set(accountId, route53);
    }

    return route53;
  }
}
