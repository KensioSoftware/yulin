import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3 } from "../../sim-s3.js";
import { SimCfnS3BucketNotificationConfiguration } from "./notification/sim-cfn-s3-bucket-notification-configuration.js";
import { SimCfnS3BucketDeclaredConfigurations } from "./sim-cfn-s3-bucket-declared-configurations.js";

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
  private readonly declared: SimCfnS3BucketDeclaredConfigurations;

  constructor(properties: SimCfnS3BucketConfiguratorProperties) {
    this.simS3 = properties.simS3;
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.bucketName = properties.bucketName;
    this.options = properties.options;
    this.declared = new SimCfnS3BucketDeclaredConfigurations({
      simS3: this.simS3,
      logicalId: this.resource.logicalId,
      properties: this.properties,
      bucketName: this.bucketName,
      options: this.options,
    });
  }

  /**
   * Apply every configuration the Resource declares.
   *
   * Versioning goes before the lifecycle rules, because a rule acting on
   * noncurrent versions describes a Bucket that keeps them. Notifications go
   * last, because S3 checks every destination the configuration names, and the
   * Resources those destinations live on have to exist by then.
   */
  async configure(): Promise<void> {
    await this.declared.applyWebsite();
    await this.declared.applyPublicAccess();
    await this.declared.applyVersioning();
    await this.declared.applyLifecycle();
    await this.configureNotifications();
  }

  /**
   * Apply the event notification configuration the Resource declares.
   *
   * This reader takes the declared value rather than the whole property bag,
   * because a notification configuration also arrives from a CDK custom
   * resource that has no AWS::S3::Bucket properties to read it out of.
   */
  private async configureNotifications(): Promise<void> {
    const declared = this.properties["NotificationConfiguration"];

    if (declared === undefined) {
      return;
    }

    const reader = new SimCfnS3BucketNotificationConfiguration(
      this.resource.logicalId,
    );
    const NotificationConfiguration = reader.read(declared);

    await this.simS3.putBucketNotificationConfiguration(
      { input: { Bucket: this.bucketName, NotificationConfiguration } },
      this.options,
    );
  }
}
