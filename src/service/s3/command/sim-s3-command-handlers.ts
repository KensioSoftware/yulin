import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3Bucket, SimS3BucketName } from "../bucket/sim-s3-bucket.js";
import type { SimS3GlobalRegistry } from "../sim-s3-global-registry.js";
import type { SimS3RequestOptions } from "../sim-s3.js";
import { CreateBucketCommandHandler } from "./create-bucket/create-bucket.handler.js";
import type {
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput,
} from "./create-bucket/create-bucket.command.js";
import { DeleteBucketPolicyCommandHandler } from "./delete-bucket-policy/delete-bucket-policy.handler.js";
import type {
  SimDeleteBucketPolicyCommand,
  SimDeleteBucketPolicyCommandOutput,
} from "./delete-bucket-policy/delete-bucket-policy.command.js";
import { GetBucketPolicyCommandHandler } from "./get-bucket-policy/get-bucket-policy.handler.js";
import type {
  SimGetBucketPolicyCommand,
  SimGetBucketPolicyCommandOutput,
} from "./get-bucket-policy/get-bucket-policy.command.js";
import { GetObjectCommandHandler } from "./get-object/get-object.handler.js";
import type {
  SimGetObjectCommand,
  SimGetObjectCommandOutput,
} from "./get-object/get-object.command.js";
import { ListBucketsCommandHandler } from "./list-buckets/list-buckets.handler.js";
import type {
  SimListBucketsCommand,
  SimListBucketsCommandOutput,
} from "./list-buckets/list-buckets.command.js";
import { ListObjectsCommandHandler } from "./list-objects/list-objects.handler.js";
import type {
  SimListObjectsCommand,
  SimListObjectsCommandOutput,
} from "./list-objects/list-objects.command.js";
import { PutBucketPolicyCommandHandler } from "./put-bucket-policy/put-bucket-policy.handler.js";
import type {
  SimPutBucketPolicyCommand,
  SimPutBucketPolicyCommandOutput,
} from "./put-bucket-policy/put-bucket-policy.command.js";
import { PutBucketWebsiteCommandHandler } from "./put-bucket-website/put-bucket-website.handler.js";
import type {
  SimPutBucketWebsiteCommand,
  SimPutBucketWebsiteCommandOutput,
} from "./put-bucket-website/put-bucket-website.command.js";
import { PutObjectCommandHandler } from "./put-object/put-object.handler.js";
import { PutPublicAccessBlockCommandHandler } from "./put-public-access-block/put-public-access-block.handler.js";
import type {
  SimPutPublicAccessBlockCommand,
  SimPutPublicAccessBlockCommandOutput,
} from "./put-public-access-block/put-public-access-block.command.js";
import { GetPublicAccessBlockCommandHandler } from "./get-public-access-block/get-public-access-block.handler.js";
import type {
  SimGetPublicAccessBlockCommand,
  SimGetPublicAccessBlockCommandOutput,
} from "./get-public-access-block/get-public-access-block.command.js";
import { DeletePublicAccessBlockCommandHandler } from "./delete-public-access-block/delete-public-access-block.handler.js";
import type {
  SimDeletePublicAccessBlockCommand,
  SimDeletePublicAccessBlockCommandOutput,
} from "./delete-public-access-block/delete-public-access-block.command.js";
import type {
  SimPutObjectCommand,
  SimPutObjectCommandOutput,
} from "./put-object/put-object.command.js";

interface SimS3CommandHandlersProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * The command handlers of one simulated S3 account/Region scope.
 *
 * Every handler authorizes against the same IAM and mutates the same Bucket
 * state, so the wiring lives here rather than being repeated once per command
 * in the service facade. That keeps SimS3 what it should be: state plus
 * delegation.
 */
export class SimS3CommandHandlers {
  private readonly properties: SimS3CommandHandlersProperties;

  constructor(properties: SimS3CommandHandlersProperties) {
    this.properties = properties;
  }

  /**
   * Create a Bucket in this scope and register it globally.
   */
  async createBucket(
    command: SimCreateBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimCreateBucketCommandOutput> {
    return await new CreateBucketCommandHandler({
      accountRegionScope: this.properties.accountRegionScope,
      buckets: this.properties.buckets,
      s3GlobalRegistry: this.properties.s3GlobalRegistry,
      iam: this.properties.iam,
      background: this.properties.background,
    }).handle(command, options);
  }

  /**
   * Replace a Bucket's resource policy.
   */
  async putBucketPolicy(
    command: SimPutBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutBucketPolicyCommandOutput> {
    return await new PutBucketPolicyCommandHandler(this.bucketState()).handle(
      command,
      options,
    );
  }

  /**
   * Read a Bucket's resource policy.
   */
  async getBucketPolicy(
    command: SimGetBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetBucketPolicyCommandOutput> {
    return await new GetBucketPolicyCommandHandler(this.bucketState()).handle(
      command,
      options,
    );
  }

  /**
   * Remove a Bucket's resource policy.
   */
  async deleteBucketPolicy(
    command: SimDeleteBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimDeleteBucketPolicyCommandOutput> {
    return await new DeleteBucketPolicyCommandHandler(
      this.bucketState(),
    ).handle(command, options);
  }

  /**
   * Replace a Bucket's Block Public Access settings.
   */
  async putPublicAccessBlock(
    command: SimPutPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutPublicAccessBlockCommandOutput> {
    return await new PutPublicAccessBlockCommandHandler(
      this.bucketState(),
    ).handle(command, options);
  }

  /**
   * Read a Bucket's Block Public Access settings.
   */
  async getPublicAccessBlock(
    command: SimGetPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetPublicAccessBlockCommandOutput> {
    return await new GetPublicAccessBlockCommandHandler(
      this.bucketState(),
    ).handle(command, options);
  }

  /**
   * Remove a Bucket's Block Public Access settings.
   */
  async deletePublicAccessBlock(
    command: SimDeletePublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimDeletePublicAccessBlockCommandOutput> {
    return await new DeletePublicAccessBlockCommandHandler(
      this.bucketState(),
    ).handle(command, options);
  }

  /**
   * Configure static website hosting on a Bucket.
   */
  async putBucketWebsite(
    command: SimPutBucketWebsiteCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutBucketWebsiteCommandOutput> {
    return await new PutBucketWebsiteCommandHandler(this.bucketState()).handle(
      command,
      options,
    );
  }

  /**
   * List the Buckets this scope owns.
   */
  async listBuckets(
    command: SimListBucketsCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimListBucketsCommandOutput> {
    return await new ListBucketsCommandHandler(this.bucketState()).handle(
      command,
      options,
    );
  }

  /**
   * Store an Object in a Bucket.
   */
  async putObject(
    command: SimPutObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutObjectCommandOutput> {
    return await new PutObjectCommandHandler(this.bucketState()).handle(
      command,
      options,
    );
  }

  /**
   * Read an Object from a Bucket.
   */
  async getObject(
    command: SimGetObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetObjectCommandOutput> {
    return await new GetObjectCommandHandler(this.bucketState()).handle(
      command,
      options,
    );
  }

  /**
   * List the Objects in a Bucket.
   */
  async listObjects(
    command: SimListObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimListObjectsCommandOutput> {
    return await new ListObjectsCommandHandler(this.bucketState()).handle(
      command,
      options,
    );
  }

  /**
   * The state and collaborators every Bucket-scoped handler is built with.
   */
  private bucketState(): {
    readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
    readonly iam: SimIamInterServiceAuthZ;
    readonly background: BackgroundScheduler;
  } {
    return {
      buckets: this.properties.buckets,
      iam: this.properties.iam,
      background: this.properties.background,
    };
  }
}
