import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import { SimCloudFormation } from "../../cloudformation/index.js";
import { SimCloudFrontRegistry } from "../../cloudfront/registry/sim-cloud-front-registry.js";
import type { SimCloudFront } from "../../cloudfront/sim-cloudfront.js";
import { SimDynamoDb } from "../../dynamodb/index.js";
import type { SimRoute53 } from "../../route53/index.js";
import { SimS3 } from "../../s3/sim-s3.js";
import { SimS3GlobalRegistry } from "../../s3/sim-s3-global-registry.js";
import { SimAwsAccountServiceCache } from "./sim-aws-account-service-cache.js";
import { SimAcm } from "../../acm/sim-acm.js";
import { SimRoute53Registry } from "../../route53/registry/sim-route53-registry.js";
import type { SimIam } from "../../iam/index.js";

interface SimAwsServiceFactoryProps {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}

/**
 * Factory for simulated AWS services.
 *
 * This keeps service construction, shared service registries, and service-level
 * singleton caches out of the top-level SimAws facade.
 */
export class SimAwsServiceFactory {
  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler & BackgroundCompleter;

  private readonly s3GlobalRegistry = new SimS3GlobalRegistry();
  private readonly route53Registry = new SimRoute53Registry();

  /**
   * Shared simulated CloudFront registry.
   *
   * This is intended for CloudFront service/controller wiring so request
   * routing uses the same registry as CloudFront SDK command handling.
   * @internal
   */
  public readonly cloudFrontRegistry = new SimCloudFrontRegistry();

  private readonly accountServices: SimAwsAccountServiceCache;

  constructor(props: SimAwsServiceFactoryProps) {
    this.simAws = props.simAws;
    this.background = props.background;
    this.accountServices = new SimAwsAccountServiceCache({
      simAws: props.simAws,
      background: props.background,
      cloudFrontRegistry: this.cloudFrontRegistry,
      route53Registry: this.route53Registry,
    });
  }

  /**
   * Create simulated ACM for an Account Region scope.
   */
  createAcm(scope: SimAwsAccountRegionContainer): SimAcm {
    return new SimAcm({
      accountRegionScope: scope.accountRegionScope,
      background: this.background,
    });
  }

  /**
   * Create simulated CloudFormation for an Account Region scope.
   */
  createCloudFormation(scope: SimAwsAccountRegionContainer): SimCloudFormation {
    return new SimCloudFormation({
      simAws: this.simAws,
      accountRegionScope: scope.accountRegionScope,
      background: this.background,
    });
  }

  /**
   * Create or get simulated CloudFront for an Account scope.
   */
  createCloudFront(scope: SimAwsAccountRegionContainer): SimCloudFront {
    return this.accountServices.createCloudFront(scope);
  }

  /**
   * Create simulated DynamoDB for an Account Region scope.
   */
  createDynamoDb(scope: SimAwsAccountRegionContainer): SimDynamoDb {
    return new SimDynamoDb({
      accountRegionScope: scope.accountRegionScope,
      background: this.background,
    });
  }

  /**
   * Create or get simulated IAM for an Account scope.
   */
  createIam(scope: SimAwsAccountRegionContainer): SimIam {
    return this.accountServices.createIam(scope, this.background);
  }

  /**
   * Create or get simulated Route53 for an Account scope.
   */
  createRoute53(scope: SimAwsAccountRegionContainer): SimRoute53 {
    return this.accountServices.createRoute53(scope);
  }

  /**
   * Create simulated S3 for an Account Region scope.
   */
  createS3(scope: SimAwsAccountRegionContainer): SimS3 {
    return new SimS3({
      accountRegionScope: scope.accountRegionScope,
      s3GlobalRegistry: this.s3GlobalRegistry,
      background: this.background,
    });
  }
}
