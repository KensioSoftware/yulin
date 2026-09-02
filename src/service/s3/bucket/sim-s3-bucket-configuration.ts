import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { SimS3BucketEncryption } from "./encryption/sim-s3-bucket-encryption.js";
import { SimS3NotificationConfiguration } from "./notification/sim-s3-notification-configuration.js";
import { SimS3PublicAccessBlock } from "./public-access/sim-s3-public-access-block.js";
import type { SimS3BucketProperties } from "./sim-s3-bucket-properties.js";
import { SimS3BucketWebsite } from "./website/sim-s3-bucket-website.js";

/**
 * How one simulated S3 Bucket is configured.
 *
 * These are the five configurations a Bucket holds one of rather than a list
 * of, and each is replaced whole by the request that sets it. None of them says
 * anything about what the Bucket stores, which is why they sit apart from the
 * Objects, the versions and the uploads.
 *
 * `SimS3Bucket` extends this, so a caller reaches all of them on the Bucket
 * itself. The lifecycle configuration is the exception and stays with the
 * Objects, because every read of one applies it.
 */
export abstract class SimS3BucketConfiguration {
  private website: SimS3BucketWebsite;
  private policy: SimIamPolicyDocument | undefined;
  private publicAccessBlock: SimS3PublicAccessBlock;
  private notifications: SimS3NotificationConfiguration;
  private encryption: SimS3BucketEncryption;

  protected constructor(properties: SimS3BucketProperties) {
    const {
      website = new SimS3BucketWebsite(),
      publicAccessBlock = SimS3PublicAccessBlock.blockingAll(),
      notifications = SimS3NotificationConfiguration.empty(),
      encryption = SimS3BucketEncryption.default(),
    } = properties;

    this.website = website;
    this.policy = properties.policy;
    this.publicAccessBlock = publicAccessBlock;
    this.notifications = notifications;
    this.encryption = encryption;
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
   * Remove the Bucket resource policy.
   *
   * Real S3 DeleteBucketPolicy is idempotent, so this reports nothing about
   * whether there was a policy to remove.
   */
  deletePolicy(): void {
    this.policy = undefined;
  }

  /**
   * Replace this Bucket's Block Public Access settings.
   */
  configurePublicAccessBlock(publicAccessBlock: SimS3PublicAccessBlock): void {
    this.publicAccessBlock = publicAccessBlock;
  }

  /**
   * Get this Bucket's Block Public Access settings.
   */
  getPublicAccessBlock(): SimS3PublicAccessBlock {
    return this.publicAccessBlock;
  }

  /**
   * Remove this Bucket's Block Public Access settings.
   *
   * Removing the configuration returns the Bucket to the all-enabled state a
   * new Bucket starts in, rather than leaving it unprotected.
   */
  deletePublicAccessBlock(): void {
    this.publicAccessBlock = SimS3PublicAccessBlock.blockingAll();
  }

  /**
   * Replace this Bucket's event notification configuration.
   *
   * Real S3 holds one configuration per Bucket rather than a list of them, so
   * this replaces what was there instead of adding to it.
   */
  configureNotifications(notifications: SimS3NotificationConfiguration): void {
    this.notifications = notifications;
  }

  /** Get this Bucket's event notification configuration. */
  getNotifications(): SimS3NotificationConfiguration {
    return this.notifications;
  }

  /** Replace this Bucket's default encryption configuration. */
  configureEncryption(encryption: SimS3BucketEncryption): void {
    this.encryption = encryption;
  }

  /** Get this Bucket's default encryption configuration. */
  getEncryption(): SimS3BucketEncryption {
    return this.encryption;
  }

  /**
   * Put this Bucket back to the encryption every Bucket has.
   *
   * Real S3 DeleteBucketEncryption leaves the Bucket SSE-S3 encrypted rather
   * than unencrypted, because there is no such thing as an unencrypted Bucket.
   */
  deleteEncryption(): void {
    this.encryption = SimS3BucketEncryption.default();
  }
}
