import type { CreateBucketCommand } from "@aws-sdk/client-s3";
import { assertDefined } from "../../../util/defined.js";
import type { Brand } from "../../../util/brand.type.js";
import type { SimS3BucketStorage } from "../storage/s3-bucket-storage.js";
import type { SimS3Object } from "../object/s3-object.js";
import { MemoryS3BucketStorage } from "../storage/s3-memory-storage.js";
import { S3BucketWebsite } from "./website/s3-bucket-website.js";

export type SimS3BucketName = Brand<string, "SimS3BucketName">;

/**
 * Simulated S3 Bucket.
 */
export class SimS3Bucket {
  public readonly bucketName: string;

  constructor(
    createCommand: CreateBucketCommand,
    private storage: SimS3BucketStorage = new MemoryS3BucketStorage(),
    private website: S3BucketWebsite = new S3BucketWebsite(),
  ) {
    assertDefined(createCommand.input.Bucket, "createCommand.input.Bucket");
    this.bucketName = createCommand.input.Bucket;
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
}
