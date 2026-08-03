import type { SimCfnTemplateValue } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type {
  SimS3NotificationFilterInput,
  SimS3NotificationFilterRuleInput,
  SimS3NotificationKeyFilterInput,
} from "../../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";

/**
 * The names each level of a CloudFormation key filter carries.
 *
 * There are three wire spellings of this filter. CloudFormation writes
 * `Filter.S3Key.Rules`, the SDK writes `Filter.Key.FilterRules`, and the REST
 * XML writes `Filter.S3Key.FilterRule`. Reading only the CloudFormation one and
 * refusing the others matters: a reader that finds nothing at the name it looked
 * for deploys an unfiltered configuration, and the Stack succeeds.
 */
const filterNames: ReadonlySet<string> = new Set(["S3Key"]);
const keyFilterNames: ReadonlySet<string> = new Set(["Rules"]);
const filterRuleNames: ReadonlySet<string> = new Set(["Name", "Value"]);

/**
 * Reads the object key filter CloudFormation writes into one notification
 * configuration, in the shape PutBucketNotificationConfiguration takes.
 *
 * Which rule names S3 filters on, and what happens when one is repeated, is the
 * command's question. This translates the names CloudFormation puts around the
 * rules into the names the request uses.
 */
export class SimCfnS3BucketNotificationFilter {
  private readonly shape: SimCfnValueShape;

  constructor(shape: SimCfnValueShape) {
    this.shape = shape;
  }

  /**
   * Read a whole filter.
   */
  read(value: SimCfnTemplateValue): SimS3NotificationFilterInput {
    const record = this.shape.record(value, "Filter");
    this.shape.knownKeys(record, filterNames, "Filter");

    return {
      Key: this.shape.present(record["S3Key"], (key) => this.keyFilter(key)),
    };
  }

  private keyFilter(
    value: SimCfnTemplateValue,
  ): SimS3NotificationKeyFilterInput {
    const record = this.shape.record(value, "Filter S3Key");
    this.shape.knownKeys(record, keyFilterNames, "Filter S3Key");

    return {
      FilterRules: this.shape.present(record["Rules"], (rules) =>
        this.shape
          .list(rules, "Filter S3Key Rules")
          .map((rule) => this.filterRule(rule)),
      ),
    };
  }

  private filterRule(
    value: SimCfnTemplateValue,
  ): SimS3NotificationFilterRuleInput {
    const record = this.shape.record(value, "Rules entry");
    this.shape.knownKeys(record, filterRuleNames, "Rules entry");

    return {
      Name: this.shape.present(record["Name"], (name) =>
        this.shape.string(name, "Rules entry Name"),
      ),
      Value: this.shape.present(record["Value"], (ruleValue) =>
        this.shape.string(ruleValue, "Rules entry Value"),
      ),
    };
  }
}
