import type { SimCfnTemplateValue } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type {
  SimS3LambdaFunctionConfigurationInput,
  SimS3NotificationConfigurationInput,
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
 * Reads the `NotificationConfiguration` property of an AWS::S3::Bucket Resource
 * into a PutBucketNotificationConfiguration request.
 *
 * CloudFormation and the SDK name the same configuration differently in four
 * places, and each of them is a silent failure if read at the wrong name:
 * `LambdaConfigurations` against `LambdaFunctionConfigurations`, a single
 * `Event` string against an `Events` list, `Function` against
 * `LambdaFunctionArn`, and `Filter.S3Key.Rules` against `Filter.Key.FilterRules`.
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
   * A destination group this simulator cannot deliver to is carried through
   * untouched, so the command refuses it by name rather than dropping it. The
   * names happen to match: CloudFormation and the SDK both call them
   * `QueueConfigurations`, `TopicConfigurations` and `EventBridgeConfiguration`.
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
        (configurations) =>
          this.shape.list(configurations, "QueueConfigurations"),
      ),
      TopicConfigurations: this.shape.present(
        record["TopicConfigurations"],
        (configurations) =>
          this.shape.list(configurations, "TopicConfigurations"),
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
      LambdaFunctionArn: this.shape.present(record["Function"], (arn) =>
        this.shape.string(arn, "Function"),
      ),
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
