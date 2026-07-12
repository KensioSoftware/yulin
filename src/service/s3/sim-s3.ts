import type { SimS3Bucket, SimS3BucketName } from "./bucket/sim-s3-bucket.js";
import { CreateBucketCommandHandler } from "./command/create-bucket/create-bucket.handler.js";
import { ListBucketsCommandHandler } from "./command/list-buckets/list-buckets.handler.js";
import { PutObjectCommandHandler } from "./command/put-object/put-object.handler.js";
import { GetObjectCommandHandler } from "./command/get-object/get-object.handler.js";
import { ListObjectsCommandHandler } from "./command/list-objects/list-objects.handler.js";
import { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { PutBucketWebsiteCommandHandler } from "./command/put-bucket-website/put-bucket-website.handler.js";
import { assertDefined } from "../../util/type-guard/defined.js";
import { FilesystemS3BucketStorage } from "./storage/filesystem/s3-filesystem-storage.js";
import type {
  SimPutObjectCommand,
  SimPutObjectCommandOutput,
} from "./command/put-object/put-object.cmd.js";
import type {
  SimPutBucketWebsiteCommand,
  SimPutBucketWebsiteCommandOutput,
} from "./command/put-bucket-website/put-bucket-website.cmd.js";
import type {
  SimListObjectsCommand,
  SimListObjectsCommandOutput,
} from "./command/list-objects/list-objects.cmd.js";
import type {
  SimListBucketsCommand,
  SimListBucketsCommandOutput,
} from "./command/list-buckets/list-buckets.cmd.js";
import type {
  SimGetObjectCommand,
  SimGetObjectCommandOutput,
} from "./command/get-object/get-object.cmd.js";
import type {
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput,
} from "./command/create-bucket/create-bucket.cmd.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { SimS3CloudFormationResourceFactory } from "./cfn/sim-cfn-s3-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsPrincipal } from "../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIam } from "../iam/index.js";

export interface SimS3RequestOptions {
  readonly caller?: SimAwsPrincipal;
}

interface SimS3Props {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly s3GlobalRegistry?: SimS3GlobalRegistry;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3. Handles SDK commands. Emulates AWS behaviour and state.
 * Scoped to an Account and Region, but has access to a global (as in
 * cross-region) registry of simulated S3 Buckets.
 */
export class SimS3 {
  private readonly buckets = new Map<SimS3BucketName, SimS3Bucket>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly s3GlobalRegistry: SimS3GlobalRegistry;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;
  private readonly cfnFactory = new SimS3CloudFormationResourceFactory(this);

  constructor(props: SimS3Props = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      s3GlobalRegistry = new SimS3GlobalRegistry(),
      iam = new SimIam(),
      background = new BackgroundTasks(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.s3GlobalRegistry = s3GlobalRegistry;
    this.iam = iam;
    this.background = background;
  }

  /**
   * Handle a Create Bucket Command from the SDK.
   */
  async createBucket(
    cmd: SimCreateBucketCommand,
    opts?: SimS3RequestOptions,
  ): Promise<SimCreateBucketCommandOutput> {
    const handler = new CreateBucketCommandHandler({
      accountRegionScope: this.accountRegionScope,
      buckets: this.buckets,
      s3GlobalRegistry: this.s3GlobalRegistry,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(cmd, opts);
  }

  /**
   * Handle a Put Bucket Website Command from the SDK.
   */
  async putBucketWebsite(
    cmd: SimPutBucketWebsiteCommand,
    opts?: SimS3RequestOptions,
  ): Promise<SimPutBucketWebsiteCommandOutput> {
    void opts;

    const handler = new PutBucketWebsiteCommandHandler({
      buckets: this.buckets,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Buckets Command from the SDK.
   */
  async listBuckets(
    cmd: SimListBucketsCommand,
    opts?: SimS3RequestOptions,
  ): Promise<SimListBucketsCommandOutput> {
    void opts;

    const handler = new ListBucketsCommandHandler({
      buckets: this.buckets,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Put Object Command from the SDK.
   */
  async putObject(
    cmd: SimPutObjectCommand,
    opts?: SimS3RequestOptions,
  ): Promise<SimPutObjectCommandOutput> {
    void opts;

    const handler = new PutObjectCommandHandler({
      buckets: this.buckets,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Get Object Command from the SDK.
   */
  async getObject(
    cmd: SimGetObjectCommand,
    opts?: SimS3RequestOptions,
  ): Promise<SimGetObjectCommandOutput> {
    void opts;

    const handler = new GetObjectCommandHandler({
      buckets: this.buckets,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Objects Command from the SDK.
   */
  async listObjects(
    cmd: SimListObjectsCommand,
    opts?: SimS3RequestOptions,
  ): Promise<SimListObjectsCommandOutput> {
    void opts;

    const handler = new ListObjectsCommandHandler({
      buckets: this.buckets,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Get a simulated S3 Bucket instance by name.
   */
  getSimBucketByName(
    bucketName: SimS3BucketName | string,
  ): SimS3Bucket | undefined {
    return this.buckets.get(bucketName as SimS3BucketName);
  }

  /**
   * Get the simulated S3 static website URL for a Bucket.
   */
  getBucketWebsiteUrl(bucketName: SimS3BucketName | string): URL {
    const bucket = this.getSimBucketByName(bucketName);
    assertDefined(bucket, `Sim S3 Bucket named ${bucketName}`);

    return bucket.getWebsiteUrl();
  }

  /**
   * Find the Account Region scope for a globally registered simulated S3 Bucket.
   */
  findBucketScope(
    bucketName: SimS3BucketName | string,
  ): SimAwsAccountRegionScope | undefined {
    return this.s3GlobalRegistry.findBucketScope(bucketName as SimS3BucketName);
  }

  /**
   * Have a simulated S3 Bucket use a local filesystem directory for storage.
   */
  mountBucketFilesystem(
    bucketName: SimS3BucketName | string,
    directoryPath: string,
  ): void {
    const bucket = this.getSimBucketByName(bucketName);
    assertDefined(bucket, `Sim S3 Bucket named ${bucketName}`);
    bucket.configureSimStorage(
      new FilesystemS3BucketStorage({ directoryPath }),
    );
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }
}
