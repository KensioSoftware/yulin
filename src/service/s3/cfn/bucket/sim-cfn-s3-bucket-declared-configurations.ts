import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3 } from "../../sim-s3.js";
import { SimCfnS3BucketLifecycleConfiguration } from "./lifecycle/sim-cfn-s3-bucket-lifecycle-configuration.js";
import { SimCfnS3BucketObjectLockConfiguration } from "./lock/sim-cfn-s3-bucket-object-lock-configuration.js";
import { SimCfnS3BucketPublicAccessConfiguration } from "./public-access/sim-cfn-s3-bucket-public-access-configuration.js";
import { SimCfnS3BucketVersioningConfiguration } from "./versioning/sim-cfn-s3-bucket-versioning-configuration.js";
import { SimCfnS3BucketWebsiteConfiguration } from "./website/sim-cfn-s3-bucket-website-configuration.js";

interface SimCfnS3BucketDeclaredConfigurationsProperties {
  readonly simS3: SimS3;
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
  readonly bucketName: string;
  readonly options: SimCfnResourceCallerOptions;
}

/**
 * The AWS::S3::Bucket properties that are read straight off the Resource and
 * handed to a command.
 *
 * Five properties with one shape between them. Each is read from the Resource,
 * left alone where the Resource omitted it, and otherwise applied through the
 * command an SDK caller would reach, so a template and an SDK caller are
 * validated identically. The event notification configuration is the one that
 * does not fit, because it also arrives from a CDK custom resource with no
 * Bucket properties behind it, so it stays with the configurator.
 */
export class SimCfnS3BucketDeclaredConfigurations {
  private readonly simS3: SimS3;
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly bucketName: string;
  private readonly options: SimCfnResourceCallerOptions;

  constructor(properties: SimCfnS3BucketDeclaredConfigurationsProperties) {
    this.simS3 = properties.simS3;
    this.logicalId = properties.logicalId;
    this.properties = properties.properties;
    this.bucketName = properties.bucketName;
    this.options = properties.options;
  }

  /**
   * Apply the website configuration the Resource declares.
   */
  async applyWebsite(): Promise<void> {
    const WebsiteConfiguration = this.read(SimCfnS3BucketWebsiteConfiguration);

    if (WebsiteConfiguration !== undefined) {
      await this.simS3.putBucketWebsite(
        { input: { Bucket: this.bucketName, WebsiteConfiguration } },
        this.options,
      );
    }
  }

  /**
   * Apply the Block Public Access settings the Resource declares.
   */
  async applyPublicAccess(): Promise<void> {
    const PublicAccessBlockConfiguration = this.read(
      SimCfnS3BucketPublicAccessConfiguration,
    );

    if (PublicAccessBlockConfiguration !== undefined) {
      await this.simS3.putPublicAccessBlock(
        { input: { Bucket: this.bucketName, PublicAccessBlockConfiguration } },
        this.options,
      );
    }
  }

  /**
   * Apply the versioning configuration the Resource declares.
   */
  async applyVersioning(): Promise<void> {
    const VersioningConfiguration = this.read(
      SimCfnS3BucketVersioningConfiguration,
    );

    if (VersioningConfiguration !== undefined) {
      await this.simS3.putBucketVersioning(
        { input: { Bucket: this.bucketName, VersioningConfiguration } },
        this.options,
      );
    }
  }

  /**
   * Apply the Object Lock configuration the Resource declares.
   *
   * This goes after versioning, because Object Lock holds a version and
   * PutObjectLockConfiguration refuses a Bucket that keeps none. A template
   * declaring Object Lock without versioning therefore fails the Resource, in
   * the words an SDK caller is refused in.
   */
  async applyObjectLock(): Promise<void> {
    const ObjectLockConfiguration = this.read(
      SimCfnS3BucketObjectLockConfiguration,
    );

    if (ObjectLockConfiguration !== undefined) {
      await this.simS3.putObjectLockConfiguration(
        { input: { Bucket: this.bucketName, ObjectLockConfiguration } },
        this.options,
      );
    }
  }

  /**
   * Apply the lifecycle rules the Resource declares.
   */
  async applyLifecycle(): Promise<void> {
    const LifecycleConfiguration = this.read(
      SimCfnS3BucketLifecycleConfiguration,
    );

    if (LifecycleConfiguration !== undefined) {
      await this.simS3.putBucketLifecycleConfiguration(
        { input: { Bucket: this.bucketName, LifecycleConfiguration } },
        this.options,
      );
    }
  }

  /**
   * Read one declared property, or nothing where the Resource omitted it.
   *
   * Every reader is built the same way, from the logical ID that names the
   * Resource in a failure and the properties the Resource declared.
   */
  private read<T>(
    Reader: new (
      logicalId: string,
      properties: SimCfnTemplateValueRecord,
    ) => { read(): T | undefined },
  ): T | undefined {
    return new Reader(this.logicalId, this.properties).read();
  }
}
