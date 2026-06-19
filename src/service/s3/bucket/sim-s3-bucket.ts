import type { Brand } from "../../../util/brand.type.js";
import type { SimS3BucketStorage } from "../storage/s3-bucket-storage.js";
import type { SimS3Object } from "../object/s3-object.js";
import { MemoryS3BucketStorage } from "../storage/s3-memory-storage.js";
import { SimS3BucketWebsite } from "./website/sim-s3-bucket-website.js";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../../aws/sim-aws-account-region-scope.js";
import { simS3BucketWebsiteUrl } from "./website/sim-s3-bucket-website-url.js";

export type SimS3BucketName = Brand<string, "SimS3BucketName">;

interface SimS3BucketProps {
  readonly bucketName: SimS3BucketName | string;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly storage?: SimS3BucketStorage;
  readonly website?: SimS3BucketWebsite;
}

/**
 * Simulated S3 Bucket.
 */
export class SimS3Bucket {
  public readonly bucketName: SimS3BucketName;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private storage: SimS3BucketStorage;
  private website: SimS3BucketWebsite;

  constructor(props: SimS3BucketProps) {
    const {
      bucketName,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      storage = new MemoryS3BucketStorage(),
      website = new SimS3BucketWebsite(),
    } = props;

    this.bucketName = bucketName as SimS3BucketName;
    this.accountRegionScope = accountRegionScope;
    this.storage = storage;
    this.website = website;
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
    if (!this.storage.allowChangeStorage()) {
      throw new Error("Cannot change simulated S3 storage implementation");
    }
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
   * Get the simulated S3 static website URL for this Bucket.
   */
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
