import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3 } from "../../sim-s3.js";
import { SimCfnS3BucketLifecycleConfiguration } from "./lifecycle/sim-cfn-s3-bucket-lifecycle-configuration.js";
import { SimCfnS3BucketNotificationConfiguration } from "./notification/sim-cfn-s3-bucket-notification-configuration.js";
import { SimCfnS3BucketPublicAccessConfiguration } from "./public-access/sim-cfn-s3-bucket-public-access-configuration.js";
import { SimCfnS3BucketWebsiteConfiguration } from "./website/sim-cfn-s3-bucket-website-configuration.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnS3BucketConfiguratorProperties {
  readonly simS3: SimS3;
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
  readonly bucketName: string;
  readonly options?: SimCfnResourceCallerOptions;
}

/**
 * Applies the configurations an AWS::S3::Bucket Resource declares to the
 * Bucket that was created for it.
 *
 * Each one goes through the command an SDK caller would reach, so a template
 * and an SDK caller are validated identically.
 */
export class SimCfnS3BucketConfigurator {
  private readonly simS3: SimS3;
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly bucketName: string;
  private readonly options: SimCfnResourceCallerOptions;

  constructor(properties: SimCfnS3BucketConfiguratorProperties) {
    this.simS3 = properties.simS3;
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.bucketName = properties.bucketName;
    this.options = properties.options;
  }

  /**
   * Apply every configuration the Resource declares.
   *
   * Notifications go last, because S3 checks every destination the
   * configuration names, and the Resources those destinations live on have to
   * exist by then.
   */
  async configure(): Promise<void> {
    await this.configureWebsite();
    await this.configurePublicAccess();
    await this.configureLifecycle();
    await this.configureNotifications();
  }

  private async configureWebsite(): Promise<void> {
    const config = new SimCfnS3BucketWebsiteConfiguration(
      this.resource.logicalId,
      this.properties,
    ).read();

    if (config === undefined) {
      return;
    }

    await this.simS3.putBucketWebsite(
      { input: { Bucket: this.bucketName, WebsiteConfiguration: config } },
      this.options,
    );
  }

  private async configurePublicAccess(): Promise<void> {
    const config = new SimCfnS3BucketPublicAccessConfiguration(
      this.resource.logicalId,
      this.properties,
    ).read();

    if (config === undefined) {
      return;
    }

    await this.simS3.putPublicAccessBlock(
      {
        input: {
          Bucket: this.bucketName,
          PublicAccessBlockConfiguration: config,
        },
      },
      this.options,
    );
  }

  private async configureLifecycle(): Promise<void> {
    const config = new SimCfnS3BucketLifecycleConfiguration(
      this.resource.logicalId,
      this.properties,
    ).read();

    if (config === undefined) {
      return;
    }

    await this.simS3.putBucketLifecycleConfiguration(
      { input: { Bucket: this.bucketName, LifecycleConfiguration: config } },
      this.options,
    );
  }

  private async configureNotifications(): Promise<void> {
    const declared = this.properties["NotificationConfiguration"];

    if (declared === undefined) {
      return;
    }

    const config = new SimCfnS3BucketNotificationConfiguration(
      this.resource.logicalId,
    ).read(declared);

    await this.simS3.putBucketNotificationConfiguration(
      { input: { Bucket: this.bucketName, NotificationConfiguration: config } },
      this.options,
    );
  }
}
