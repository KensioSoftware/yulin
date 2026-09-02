import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type {
  SimS3LifecycleConfiguration,
  SimS3LifecycleRule,
} from "../../../command/put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";
import { s3BucketResourceError } from "../error/sim-cfn-s3-bucket-error.js";
import {
  simCfnS3CarriedRuleFields,
  simCfnS3RuleExpiration,
  simCfnS3RuleNoncurrentExpiration,
  simCfnS3StatedFields,
} from "./sim-cfn-s3-bucket-lifecycle-fields.js";
import { readSimCfnS3LifecycleFilter } from "./sim-cfn-s3-bucket-lifecycle-filter.js";
import { readSimCfnS3LifecycleTransitions } from "./sim-cfn-s3-bucket-lifecycle-transitions.js";

/**
 * Reads the `LifecycleConfiguration` property of an AWS::S3::Bucket Resource
 * into a PutBucketLifecycleConfiguration request.
 *
 * A rule field this reader has no translation for is carried across unchanged
 * rather than dropped or refused. Dropping it would deploy a Bucket whose
 * rules read back shorter than the template asked for, and refusing it would
 * fail a Stack over a field nothing in the simulation acts on anyway.
 */
export class SimCfnS3BucketLifecycleConfiguration {
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly shape: SimCfnValueShape;

  constructor(logicalId: string, properties: SimCfnTemplateValueRecord) {
    this.properties = properties;
    this.shape = new SimCfnValueShape((reason) =>
      s3BucketResourceError(logicalId, reason),
    );
  }

  /**
   * The configuration to apply, or nothing when the Resource declares none.
   *
   * A configuration that is there but is not the shape it should be fails the
   * Resource. Read as nothing, it would deploy a Bucket whose rules a test
   * then finds missing without being told why.
   */
  read(): SimS3LifecycleConfiguration | undefined {
    const declared = this.properties["LifecycleConfiguration"];

    if (declared === undefined) {
      return undefined;
    }

    const configuration = this.shape.record(declared, "LifecycleConfiguration");
    const rules = this.shape.list(
      configuration["Rules"] ?? [],
      "LifecycleConfiguration Rules",
    );

    return {
      Rules: rules.map((rule, index) => this.readRule(rule, index)),
    };
  }

  private readRule(
    declared: SimCfnTemplateValue,
    index: number,
  ): SimS3LifecycleRule {
    const path = `LifecycleConfiguration Rules[${index}]`;
    const rule = this.shape.record(declared, path);

    return {
      ...simCfnS3CarriedRuleFields(rule),
      ...simCfnS3StatedFields({
        ID: rule["Id"],
        Filter: readSimCfnS3LifecycleFilter({
          shape: this.shape,
          rule,
          path,
        }),
        Expiration: simCfnS3RuleExpiration(rule),
        NoncurrentVersionExpiration: simCfnS3RuleNoncurrentExpiration(rule),
        Transitions: readSimCfnS3LifecycleTransitions({
          shape: this.shape,
          listed: rule["Transitions"],
          singular: rule["Transition"],
          path,
        }),
      }),
    };
  }
}
