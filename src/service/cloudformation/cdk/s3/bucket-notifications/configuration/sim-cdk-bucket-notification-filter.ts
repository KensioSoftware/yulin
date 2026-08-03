import type {
  SimS3NotificationFilterInput,
  SimS3NotificationFilterRuleInput,
  SimS3NotificationKeyFilterInput,
} from "../../../../../s3/command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import type { SimCfnTemplateValue } from "../../../../template/value/sim-cfn-template-value.js";
import type { SimCfnValueShape } from "../../../../template/value/sim-cfn-value-shape.js";

/**
 * Reads the object key filter of one notification configuration.
 *
 * Which rule names S3 filters on, and what happens when one is repeated, is
 * the command's question. This reads the three levels of nesting the request
 * shape puts around the rules.
 */
export class SimCdkBucketNotificationFilter {
  private readonly shape: SimCfnValueShape;

  constructor(shape: SimCfnValueShape) {
    this.shape = shape;
  }

  /**
   * Read a whole filter.
   */
  read(value: SimCfnTemplateValue): SimS3NotificationFilterInput {
    const record = this.shape.record(value, "Filter");

    return {
      Key: this.shape.present(record["Key"], (key) => this.keyFilter(key)),
    };
  }

  private keyFilter(
    value: SimCfnTemplateValue,
  ): SimS3NotificationKeyFilterInput {
    const record = this.shape.record(value, "Filter Key");

    return {
      FilterRules: this.shape.present(record["FilterRules"], (rules) =>
        this.shape
          .list(rules, "FilterRules")
          .map((rule) => this.filterRule(rule)),
      ),
    };
  }

  private filterRule(
    value: SimCfnTemplateValue,
  ): SimS3NotificationFilterRuleInput {
    const record = this.shape.record(value, "FilterRules entry");

    return {
      Name: this.shape.present(record["Name"], (name) =>
        this.shape.string(name, "FilterRules entry Name"),
      ),
      Value: this.shape.present(record["Value"], (ruleValue) =>
        this.shape.string(ruleValue, "FilterRules entry Value"),
      ),
    };
  }
}
