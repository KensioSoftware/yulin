import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountId } from "../sim-aws-account.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import { SimCloudFormation } from "../../cloudformation/index.js";
import { SimCloudFront } from "../../cloudfront/sim-cloudfront.js";
import { SimCloudFrontRegistry } from "../../cloudfront/sim-cloud-front-registry.js";
import { makeSimCfS3OriginResolver } from "../../cloudfront/origin/s3/sim-cf-s3-origin-resolver-factory.js";
import { SimDynamoDb } from "../../dynamodb/index.js";
import { SimS3 } from "../../s3/sim-s3.js";
import { SimS3GlobalRegistry } from "../../s3/sim-s3-global-registry.js";

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

  private readonly _cloudFrontRegistry = new SimCloudFrontRegistry();

  private readonly cloudFrontServices = new Map<
    SimAwsAccountId,
    SimCloudFront
  >();

  constructor(props: SimAwsServiceFactoryProps) {
    this.simAws = props.simAws;
    this.background = props.background;
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
    const { accountId } = scope.accountRegionScope;

    let cloudFront = this.cloudFrontServices.get(accountId);

    if (cloudFront === undefined) {
      cloudFront = new SimCloudFront({
        accountRegionScope: scope.accountRegionScope,
        cloudFrontRegistry: this._cloudFrontRegistry,
        s3OriginResolver: makeSimCfS3OriginResolver(this.simAws, scope),
        background: this.background,
      });
      this.cloudFrontServices.set(accountId, cloudFront);
    }

    return cloudFront;
  }

  /**
   * Get the shared simulated CloudFront registry.
   *
   * This is intended for CloudFront service/controller wiring so request routing
   * uses the same registry as CloudFront SDK command handling.
   */
  cloudFrontRegistry(): SimCloudFrontRegistry {
    return this._cloudFrontRegistry;
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
