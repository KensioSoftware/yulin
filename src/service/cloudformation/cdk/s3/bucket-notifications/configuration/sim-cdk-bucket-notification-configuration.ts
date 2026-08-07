import type {
  SimS3LambdaFunctionConfigurationInput,
  SimS3NotificationConfigurationInput,
  SimS3QueueConfigurationInput,
  SimS3TopicConfigurationInput,
} from "../../../../../s3/command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import type { SimCfnTemplateValue } from "../../../../template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../template/value/sim-cfn-value-shape.js";
import { bucketNotificationsError } from "../error/sim-cdk-bucket-notification-error.js";
import { SimCdkBucketNotificationFilter } from "./sim-cdk-bucket-notification-filter.js";

/**
 * Reads the `NotificationConfiguration` property of a
 * Custom::S3BucketNotifications Resource into a
 * PutBucketNotificationConfiguration request.
 *
 * CDK emits the SDK request shape into the Resource, so this translates types
 * rather than structure: what the template says is what the command receives.
 * Only the shape is read here. Whether the configuration is one simulated S3
 * accepts is the command's question, so a template and an SDK caller are
 * answered by the same validation.
 */
export class SimCdkBucketNotificationConfiguration {
  private readonly shape: SimCfnValueShape;
  private readonly filter: SimCdkBucketNotificationFilter;

  constructor(logicalId: string) {
    this.shape = new SimCfnValueShape((reason) =>
      bucketNotificationsError(logicalId, reason),
    );
    this.filter = new SimCdkBucketNotificationFilter(this.shape);
  }

  /**
   * Read a whole notification configuration.
   *
   * A destination group this simulator cannot deliver to is carried through
   * untouched, so the command refuses it by name rather than dropping it.
   */
  read(
    value: SimCfnTemplateValue | undefined,
  ): SimS3NotificationConfigurationInput {
    const record = this.shape.record(value, "NotificationConfiguration");

    return {
      LambdaFunctionConfigurations: this.shape.present(
        record["LambdaFunctionConfigurations"],
        (configurations) => this.lambdaConfigurations(configurations),
      ),
      QueueConfigurations: this.shape.present(
        record["QueueConfigurations"],
        (configurations) => this.queueConfigurations(configurations),
      ),
      TopicConfigurations: this.shape.present(
        record["TopicConfigurations"],
        (configurations) => this.topicConfigurations(configurations),
      ),
      EventBridgeConfiguration: this.shape.present(
        record["EventBridgeConfiguration"],
        (configuration) =>
          this.shape.record(configuration, "EventBridgeConfiguration"),
      ),
    };
  }

  private lambdaConfigurations(
    value: SimCfnTemplateValue,
  ): readonly SimS3LambdaFunctionConfigurationInput[] {
    return this.shape
      .list(value, "LambdaFunctionConfigurations")
      .map((configuration) => this.lambdaConfiguration(configuration));
  }

  private lambdaConfiguration(
    value: SimCfnTemplateValue,
  ): SimS3LambdaFunctionConfigurationInput {
    const record = this.shape.record(
      value,
      "LambdaFunctionConfigurations entry",
    );

    return {
      Id: this.shape.present(record["Id"], (id) => this.shape.string(id, "Id")),
      LambdaFunctionArn: this.shape.present(
        record["LambdaFunctionArn"],
        (arn) => this.shape.string(arn, "LambdaFunctionArn"),
      ),
      Events: this.shape.present(record["Events"], (events) =>
        this.events(events),
      ),
      Filter: this.shape.present(record["Filter"], (filter) =>
        this.filter.read(filter),
      ),
    };
  }

  private queueConfigurations(
    value: SimCfnTemplateValue,
  ): readonly SimS3QueueConfigurationInput[] {
    return this.shape
      .list(value, "QueueConfigurations")
      .map((configuration) => this.queueConfiguration(configuration));
  }

  private queueConfiguration(
    value: SimCfnTemplateValue,
  ): SimS3QueueConfigurationInput {
    const record = this.shape.record(value, "QueueConfigurations entry");

    return {
      Id: this.shape.present(record["Id"], (id) => this.shape.string(id, "Id")),
      QueueArn: this.shape.present(record["QueueArn"], (arn) =>
        this.shape.string(arn, "QueueArn"),
      ),
      Events: this.shape.present(record["Events"], (events) =>
        this.events(events),
      ),
      Filter: this.shape.present(record["Filter"], (filter) =>
        this.filter.read(filter),
      ),
    };
  }

  private topicConfigurations(
    value: SimCfnTemplateValue,
  ): readonly SimS3TopicConfigurationInput[] {
    return this.shape
      .list(value, "TopicConfigurations")
      .map((configuration) => this.topicConfiguration(configuration));
  }

  private topicConfiguration(
    value: SimCfnTemplateValue,
  ): SimS3TopicConfigurationInput {
    const record = this.shape.record(value, "TopicConfigurations entry");

    return {
      Id: this.shape.present(record["Id"], (id) => this.shape.string(id, "Id")),
      TopicArn: this.shape.present(record["TopicArn"], (arn) =>
        this.shape.string(arn, "TopicArn"),
      ),
      Events: this.shape.present(record["Events"], (events) =>
        this.events(events),
      ),
      Filter: this.shape.present(record["Filter"], (filter) =>
        this.filter.read(filter),
      ),
    };
  }

  private events(value: SimCfnTemplateValue): readonly string[] {
    return this.shape
      .list(value, "Events")
      .map((event, index) =>
        this.shape.string(event, `Events entry ${String(index)}`),
      );
  }
}
