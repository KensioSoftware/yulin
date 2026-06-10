import type { Brand } from "../../../util/brand.type.js";
import type { SimS3BucketStorage } from "../storage/s3-bucket-storage.js";
import type { SimS3Object } from "../object/s3-object.js";
import { MemoryS3BucketStorage } from "../storage/s3-memory-storage.js";
import { S3BucketWebsite } from "./website/s3-bucket-website.js";
import { simAwsLocalConf } from "../../../serve/http/sim-aws-local.conf.js";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../../aws/sim-aws-account-region-scope.js";

export type SimS3BucketName = Brand<string, "SimS3BucketName">;

/**
 * Simulated S3 Bucket.
 */
export class SimS3Bucket {
  public readonly bucketName: SimS3BucketName;

  constructor(
    bucketName: SimS3BucketName | string,
    private readonly accountRegionScope: SimAwsAccountRegionScope = simAwsAccountRegionScopeFactory.make(),
    private storage: SimS3BucketStorage = new MemoryS3BucketStorage(),
    private website: S3BucketWebsite = new S3BucketWebsite(),
  ) {
    this.bucketName = bucketName as SimS3BucketName;
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
  configureWebsite(website: S3BucketWebsite): void {
    this.website = website;
  }

  /**
   * Get static website configuration for this simulated S3 Bucket.
   */
  getWebsite(): S3BucketWebsite {
    return this.website;
  }

  /**
   * Get the simulated S3 static website URL for this Bucket.
   */
  getWebsiteUrl(): URL {
    if (!this.getWebsite().websiteEnabled()) {
      throw new Error(
        `Static website hosting is not enabled for sim S3 Bucket ${this.bucketName}`,
      );
    }
    return new URL(
      `http://${this.bucketName}.s3-website.${this.accountRegionScope.regionName}.${simAwsLocalConf.hostname}/`,
    );
  }
}
