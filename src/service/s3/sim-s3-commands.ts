import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3Bucket, SimS3BucketName } from "./bucket/sim-s3-bucket.js";
import { SimS3BucketCommands } from "./command/bucket/sim-s3-bucket-commands.js";
import { SimS3BucketPolicyCommands } from "./command/bucket-policy/sim-s3-bucket-policy-commands.js";
import { SimS3ObjectCommands } from "./command/object/sim-s3-object-commands.js";
import { SimS3PublicAccessBlockCommands } from "./command/public-access-block/sim-s3-public-access-block-commands.js";
import type { SimS3BucketCommandState } from "./command/sim-s3-bucket-command-state.js";
import type { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";

/**
 * How one simulated S3 is put together.
 */
export interface SimS3Properties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly s3GlobalRegistry?: SimS3GlobalRegistry;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface SimS3CommandsProperties extends SimS3Properties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
}

/**
 * The command areas of one simulated S3 scope, and the state they share.
 *
 * Every command authorizes against the same IAM and works on the same Bucket
 * map, so the wiring lives here rather than being repeated once per command in
 * the service facade. That keeps SimS3 what it should be: state plus
 * delegation.
 */
export class SimS3Commands {
  public readonly buckets: SimS3BucketCommands;
  public readonly bucketPolicies: SimS3BucketPolicyCommands;
  public readonly publicAccessBlocks: SimS3PublicAccessBlockCommands;
  public readonly objects: SimS3ObjectCommands;

  constructor(properties: SimS3CommandsProperties) {
    const {
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const state: SimS3BucketCommandState = {
      buckets: properties.buckets,
      iam,
      background,
    };

    this.buckets = new SimS3BucketCommands({
      ...state,
      accountRegionScope: properties.accountRegionScope,
      s3GlobalRegistry: properties.s3GlobalRegistry,
    });
    this.bucketPolicies = new SimS3BucketPolicyCommands(state);
    this.publicAccessBlocks = new SimS3PublicAccessBlockCommands(state);
    this.objects = new SimS3ObjectCommands(state);
  }
}
