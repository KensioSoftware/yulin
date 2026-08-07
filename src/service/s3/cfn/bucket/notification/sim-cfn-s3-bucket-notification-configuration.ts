import type { SimCfnTemplateValue } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type {
  SimS3LambdaFunctionConfigurationInput,
  SimS3NotificationConfigurationInput,
  SimS3NotificationFilterInput,
  SimS3QueueConfigurationInput,
  SimS3TopicConfigurationInput,
} from "../../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import { s3BucketNotificationError } from "../error/sim-cfn-s3-bucket-error.js";
import { SimCfnS3BucketNotificationFilter } from "./sim-cfn-s3-bucket-notification-filter.js";

/**
 * The destination groups an AWS::S3::Bucket NotificationConfiguration carries.
 */
const configurationNames: ReadonlySet<string> = new Set([
  "EventBridgeConfiguration",
  "LambdaConfigurations",
  "QueueConfigurations",
  "TopicConfigurations",
]);

/**
 * The names one CloudFormation LambdaConfiguration carries.
 *
 * There is no `Id`, unlike the request shape. CloudFormation does not let a
 * template name a configuration, so S3 generates the id.
 */
const lambdaConfigurationNames: ReadonlySet<string> = new Set([
  "Event",
  "Filter",
  "Function",
]);

/**
 * The names one CloudFormation QueueConfiguration carries.
 *
 * `Queue` is the queue's ARN, despite the name, which is the third place
 * CloudFormation calls the same thing something else.
 */
const queueConfigurationNames: ReadonlySet<string> = new Set([
  "Event",
  "Filter",
  "Queue",
]);

/**
 * The names one CloudFormation TopicConfiguration carries.
 *
 * `Topic` is the topic's ARN, the same shortening CloudFormation applies to a
 * queue destination.
 */
const topicConfigurationNames: ReadonlySet<string> = new Set([
  "Event",
  "Filter",
  "Topic",
]);

/**
 * The parts of one CloudFormation destination configuration that are the same
 * whichever destination it names.
 */
interface SimCfnS3BucketNotificationParts {
  readonly Events?: readonly string[] | undefined;
  readonly Filter?: SimS3NotificationFilterInput | undefined;
}

/**
 * Reads the `NotificationConfiguration` property of an AWS::S3::Bucket Resource
 * into a PutBucketNotificationConfiguration request.
 *
 * CloudFormation and the SDK name the same configuration differently in several
 * places, and each of them is a silent failure if read at the wrong name:
 * `LambdaConfigurations` against `LambdaFunctionConfigurations`, a single
 * `Event` string against an `Events` list, `Function` against
 * `LambdaFunctionArn`, `Queue` against `QueueArn`, `Topic` against `TopicArn`,
 * and `Filter.S3Key.Rules` against `Filter.Key.FilterRules`.
 *
 * Only the shape is read here. Whether the configuration is one simulated S3
 * accepts is the command's question, so a template and an SDK caller are
 * answered by the same validation.
 */
export class SimCfnS3BucketNotificationConfiguration {
  private readonly shape: SimCfnValueShape;
  private readonly filter: SimCfnS3BucketNotificationFilter;

  constructor(logicalId: string) {
    this.shape = new SimCfnValueShape((reason) =>
      s3BucketNotificationError(logicalId, reason),
    );
    this.filter = new SimCfnS3BucketNotificationFilter(this.shape);
  }

  /**
   * Read a whole notification configuration.
   *
   * `EventBridgeConfiguration` is carried through untouched, so the command
   * refuses it by name rather than dropping it. The name happens to match:
   * CloudFormation and the SDK both spell it that way, as they do
   * `QueueConfigurations` and `TopicConfigurations`.
   */
  read(value: SimCfnTemplateValue): SimS3NotificationConfigurationInput {
    const record = this.shape.record(value, "NotificationConfiguration");
    this.shape.knownKeys(
      record,
      configurationNames,
      "NotificationConfiguration",
    );

    return {
      LambdaFunctionConfigurations: this.shape.present(
        record["LambdaConfigurations"],
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
      .list(value, "LambdaConfigurations")
      .map((configuration) => this.lambdaConfiguration(configuration));
  }

  private lambdaConfiguration(
    value: SimCfnTemplateValue,
  ): SimS3LambdaFunctionConfigurationInput {
    const record = this.shape.record(value, "LambdaConfigurations entry");
    this.shape.knownKeys(
      record,
      lambdaConfigurationNames,
      "LambdaConfigurations entry",
    );

    return {
      ...this.notificationParts(record),
      LambdaFunctionArn: this.shape.present(record["Function"], (arn) =>
        this.shape.string(arn, "Function"),
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
    this.shape.knownKeys(
      record,
      queueConfigurationNames,
      "QueueConfigurations entry",
    );

    return {
      ...this.notificationParts(record),
      QueueArn: this.shape.present(record["Queue"], (arn) =>
        this.shape.string(arn, "Queue"),
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
    this.shape.knownKeys(
      record,
      topicConfigurationNames,
      "TopicConfigurations entry",
    );

    return {
      ...this.notificationParts(record),
      TopicArn: this.shape.present(record["Topic"], (arn) =>
        this.shape.string(arn, "Topic"),
      ),
    };
  }

  private notificationParts(
    record: Readonly<Record<string, SimCfnTemplateValue>>,
  ): SimCfnS3BucketNotificationParts {
    return {
      // CloudFormation states one event per configuration, where the request
      // takes a list, so one configuration becomes a one-element Events list.
      Events: this.shape.present(record["Event"], (event) => [
        this.shape.string(event, "Event"),
      ]),
      Filter: this.shape.present(record["Filter"], (filter) =>
        this.filter.read(filter),
      ),
    };
  }
}
