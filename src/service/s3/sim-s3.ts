import type { SimS3Bucket, SimS3BucketName } from "./bucket/sim-s3-bucket.js";
import { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { SimS3BucketAccess } from "./bucket/sim-s3-bucket-access.js";
import { SimS3CloudFormationResourceFactory } from "./cfn/sim-cfn-s3-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimS3Commands, type SimS3Properties } from "./sim-s3-commands.js";
import { SimS3Operations } from "./sim-s3-operations.js";
import { SimS3SdkCommandRouter } from "./sdk/sim-s3-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimS3NotificationDeliveryFailure } from "./notification/sim-s3-notification-failures.js";
import type { SimS3MountFilesystemOptions } from "./mount/sim-s3-mount.type.js";

/**
 * Simulated S3. Handles SDK commands. Emulates AWS behaviour and state.
 * Scoped to an Account and Region, but has access to a global (as in
 * cross-region) registry of simulated S3 Buckets.
 *
 * This holds the simulator-only controls, the ones with no AWS equivalent.
 * The AWS operations are on `SimS3Operations`, which this extends. A caller
 * reaches both kinds on the one service object.
 */
export class SimS3 extends SimS3Operations {
  private readonly bucketAccess: SimS3BucketAccess;
  private readonly cfnFactory = new SimS3CloudFormationResourceFactory(this);
  private readonly sdkRouter = new SimS3SdkCommandRouter(this);

  constructor(properties: SimS3Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      s3GlobalRegistry = new SimS3GlobalRegistry(),
    } = properties;
    const buckets = new Map<SimS3BucketName, SimS3Bucket>();

    super(
      new SimS3Commands({
        ...properties,
        accountRegionScope,
        s3GlobalRegistry,
        buckets,
      }),
    );

    this.bucketAccess = new SimS3BucketAccess({
      buckets,
      accountRegionScope,
      s3GlobalRegistry,
    });
  }

  /**
   * Change how many keys one page of an Object listing holds, which real S3
   * fixes at a thousand.
   *
   * Lowering it is how a test gets a caller to walk a continuation without
   * storing a thousand and one Objects to provoke one.
   */
  configureMaxKeysPerPage(maxKeys: number): void {
    this.commands.objects.configureMaxKeysPerPage(maxKeys);
  }

  /** Get a simulated S3 Bucket instance by name. */
  getSimBucketByName(
    bucketName: SimS3BucketName | string,
  ): SimS3Bucket | undefined {
    return this.bucketAccess.find(bucketName);
  }

  /**
   * Get the Bucket event notifications this S3 could not deliver, which is the
   * only place a handler that threw or a destination that refused shows up:
   * real S3 tells the caller who wrote the Object nothing about a delivery.
   */
  getNotificationDeliveryFailures(): readonly SimS3NotificationDeliveryFailure[] {
    return this.commands.objectNotifier.deliveryFailures;
  }

  /**
   * Get the simulated S3 REST API endpoint URL for this Region, which is what
   * an AWS SDK S3 client, and the presigner built on it, is configured with.
   */
  getServiceUrl(): URL {
    return this.bucketAccess.serviceUrl();
  }

  /** Get the simulated S3 REST API endpoint URL for one Bucket. */
  getBucketUrl(bucketName: SimS3BucketName | string): URL {
    return this.bucketAccess.url(bucketName);
  }

  /** Get the simulated S3 static website URL for a Bucket. */
  getBucketWebsiteUrl(bucketName: SimS3BucketName | string): URL {
    return this.bucketAccess.websiteUrl(bucketName);
  }

  /**
   * Find the Account Region scope for a globally registered simulated S3 Bucket.
   */
  findBucketScope(
    bucketName: SimS3BucketName | string,
  ): SimAwsAccountRegionScope | undefined {
    return this.bucketAccess.scopeOf(bucketName);
  }

  /**
   * Have a simulated S3 Bucket use a local filesystem directory for storage,
   * watching it when `{ reload: srv }` says where to reload.
   *
   * See `SimS3BucketAccess.mountFilesystem`, which describes what a mounted
   * directory does about the metadata a file cannot carry.
   */
  mountBucketFilesystem(
    bucketName: SimS3BucketName | string,
    directoryPath: string,
    options: SimS3MountFilesystemOptions = {},
  ): void {
    this.bucketAccess.mountFilesystem(bucketName, directoryPath, options);
  }

  /** The mounted directories being watched for changes. */
  watchedMountedDirectories(): readonly string[] {
    return this.bucketAccess.watchedMounts();
  }

  /** Stop watching mounted directories, as `close` does. */
  stopWatchingMountedDirectories(): void {
    this.bucketAccess.stopWatchingMounts();
  }

  /**
   * Let go of everything this simulated S3 is holding open.
   *
   * The mounted directory watches, which is what `SimAws.close()` reaches to
   * release when a simulated environment is closed as a whole. A watch holds an
   * open filesystem handle, so a process with one open does not exit on its
   * own: a dev process wants exactly that, and anything with an end, such as a
   * test, closes when it is done. The Buckets and the Objects in them are left
   * where they are, mounts included: this is the open filesystem handles going,
   * not the storage behind them.
   */
  close(): void {
    this.stopWatchingMountedDirectories();
  }

  /** Get this service's CloudFormation Resource factory. */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }

  /** Get this service's SDK Command router for SDK client interception. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

export { type SimS3RequestOptions } from "./command/sim-s3-request-options.js";
