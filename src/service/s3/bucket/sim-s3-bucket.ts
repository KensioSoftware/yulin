import type { Brand } from "../../../util/brand.type.js";
import type { SimS3BucketStorage } from "../storage/s3-bucket-storage.js";
import type { SimS3Object } from "../object/s3-object.js";
import { MemoryS3BucketStorage } from "../storage/s3-memory-storage.js";
import { SimS3BucketWebsite } from "./website/sim-s3-bucket-website.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { simS3BucketWebsiteUrl } from "./website/sim-s3-bucket-website-url.js";
import { validateS3BucketName } from "./validate/validate-s3-bucket-name.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";

export type SimS3BucketName = Brand<string, "SimS3BucketName">;

interface SimS3BucketProps {
  readonly bucketName: SimS3BucketName | string;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly storage?: SimS3BucketStorage;
  readonly website?: SimS3BucketWebsite;
  readonly policy?: SimIamPolicyDocument | undefined;
}

/**
 * Simulated S3 Bucket.
 */
export class SimS3Bucket {
  public readonly bucketName: SimS3BucketName;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private storage: SimS3BucketStorage;
  private website: SimS3BucketWebsite;
  private policy: SimIamPolicyDocument | undefined;

  constructor(props: SimS3BucketProps) {
    const {
      bucketName,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      storage = new MemoryS3BucketStorage(),
      website = new SimS3BucketWebsite(),
      policy,
    } = props;

    validateS3BucketName(bucketName);

    this.bucketName = bucketName;
    this.accountRegionScope = accountRegionScope;
    this.storage = storage;
    this.website = website;
    this.policy = policy;
  }

  /**
   * Put a simulated S3 Object into storage.
   */
  async putObject(object: SimS3Object): Promise<void> {
    await this.storage.putObject(object);
  }

  /**
   * Get a simulated S3 Object from storage.
   */
  async getObject(key: string): Promise<SimS3Object | undefined> {
    return await this.storage.getObject(key);
  }

  /**
   * List simulated S3 Objects from storage.
   */
  async listObjects(prefix?: string): Promise<SimS3Object[]> {
    return await this.storage.listObjects(prefix);
  }

  /**
   * Change the storage implementation for this simulated S3 Bucket.
   */
  configureSimStorage(storage: SimS3BucketStorage): void {
    this.storage = storage;
  }

  /**
   * Configure static website hosting for this simulated S3 Bucket.
   */
  configureWebsite(website: SimS3BucketWebsite): void {
    this.website = website;
  }

  /**
   * Get static website configuration for this simulated S3 Bucket.
   */
  getWebsite(): SimS3BucketWebsite {
    return this.website;
  }

  /**
   * Configure the Bucket resource policy.
   */
  configurePolicy(policy: SimIamPolicyDocument): void {
    this.policy = policy;
  }

  /**
   * Get the Bucket resource policy.
   */
  getPolicy(): SimIamPolicyDocument | undefined {
    return this.policy;
  }

  /**
   * Get the simulated AWS account Region scope for this Bucket.
   */
  getAccountRegionScope(): SimAwsAccountRegionScope {
    return this.accountRegionScope;
  }

  /**
   * Get the simulated S3 static website URL for this Bucket.
   */
  getWebsiteUrl(): URL {
    return simS3BucketWebsiteUrl(
      this.bucketName,
      this.accountRegionScope,
      this.website,
    );
  }
}
