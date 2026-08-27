import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import type { SimS3Bucket, SimS3BucketName } from "./bucket/sim-s3-bucket.js";
import { SimS3BucketCommands } from "./command/bucket/sim-s3-bucket-commands.js";
import { SimS3BucketPolicyCommands } from "./command/bucket-policy/sim-s3-bucket-policy-commands.js";
import { SimS3LifecycleCommands } from "./command/lifecycle/sim-s3-lifecycle-commands.js";
import { SimS3MultipartCommands } from "./command/multipart/sim-s3-multipart-commands.js";
import { SimS3NotificationCommands } from "./command/notification/sim-s3-notification-commands.js";
import { SimS3ObjectCommands } from "./command/object/sim-s3-object-commands.js";
import { SimS3PublicAccessBlockCommands } from "./command/public-access-block/sim-s3-public-access-block-commands.js";
import type { SimS3BucketCommandState } from "./command/sim-s3-bucket-command-state.js";
import type { SimS3NotificationDestinations } from "./notification/destination/sim-s3-notification-destination.js";
import { SimS3NoNotificationDestinations } from "./notification/destination/sim-s3-service-notification-destinations.js";
import { SimS3ObjectNotifier } from "./notification/sim-s3-object-notifier.js";
import { SimS3ObjectListingLimits } from "./object/s3-object-listing-limits.js";
import type { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";

/**
 * How one simulated S3 is put together.
 */
export interface SimS3Properties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly s3GlobalRegistry?: SimS3GlobalRegistry;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  /**
   * Where this S3 can send Bucket event notifications. A SimS3 built on its own
   * has nothing to notify, and says so when a configuration names a
   * destination.
   */
  readonly notificationDestinations?: SimS3NotificationDestinations;
  /**
   * The most keys one page of an Object listing holds, which real S3 fixes at
   * a thousand. Lower it to exercise a caller's pagination without having to
   * store a thousand and one Objects first.
   */
  readonly maxKeysPerPage?: number;
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
  public readonly notifications: SimS3NotificationCommands;
  public readonly lifecycles: SimS3LifecycleCommands;
  public readonly objects: SimS3ObjectCommands;
  public readonly multipartUploads: SimS3MultipartCommands;
  public readonly objectNotifier: SimS3ObjectNotifier;

  constructor(properties: SimS3CommandsProperties) {
    const {
      background = new BackgroundTasks(),
      notificationDestinations = new SimS3NoNotificationDestinations(),
    } = properties;

    const iam = simIamInRegion(
      properties.iam,
      properties.accountRegionScope.regionName,
    );

    this.objectNotifier = new SimS3ObjectNotifier({
      destinations: notificationDestinations,
      background,
    });

    const state: SimS3BucketCommandState = {
      buckets: properties.buckets,
      iam,
      background,
      notificationDestinations,
      notifications: this.objectNotifier,
      listing: new SimS3ObjectListingLimits(properties.maxKeysPerPage),
    };

    this.buckets = new SimS3BucketCommands({
      ...state,
      accountRegionScope: properties.accountRegionScope,
      s3GlobalRegistry: properties.s3GlobalRegistry,
    });
    this.bucketPolicies = new SimS3BucketPolicyCommands(state);
    this.publicAccessBlocks = new SimS3PublicAccessBlockCommands(state);
    this.notifications = new SimS3NotificationCommands(state);
    this.lifecycles = new SimS3LifecycleCommands(state);
    this.objects = new SimS3ObjectCommands(state);
    this.multipartUploads = new SimS3MultipartCommands(state);
  }
}
