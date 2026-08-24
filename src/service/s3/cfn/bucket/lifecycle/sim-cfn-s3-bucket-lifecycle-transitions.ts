import type { SimCfnTemplateValue } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";
import {
  simCfnS3LifecycleDate,
  simCfnS3StatedFields,
} from "./sim-cfn-s3-bucket-lifecycle-fields.js";

interface SimCfnS3LifecycleTransitionsProperties {
  readonly shape: SimCfnValueShape;
  readonly listed: SimCfnTemplateValue | undefined;
  readonly singular: SimCfnTemplateValue | undefined;
  readonly path: string;
}

/**
 * Reads the storage class transitions of one AWS::S3::Bucket lifecycle rule.
 *
 * A template may state them as a `Transitions` list, as a singular
 * `Transition`, or as both, and CloudFormation accepts all three. They arrive
 * as the one list the request carries. Each one is timed by `Days` or `Date`
 * where the template says `TransitionInDays` or `TransitionDate`.
 */
export function readSimCfnS3LifecycleTransitions(
  properties: SimCfnS3LifecycleTransitionsProperties,
): SimCfnTemplateValue[] | undefined {
  const { shape, listed, singular, path } = properties;
  const declared =
    listed === undefined ? [] : shape.list(listed, `${path} Transitions`);
  const all = singular === undefined ? declared : [...declared, singular];

  if (all.length === 0) {
    return undefined;
  }

  return all.map((transition, position) => {
    const { TransitionDate, TransitionInDays, ...carried } = shape.record(
      transition,
      `${path} Transitions[${position}]`,
    );

    return {
      ...carried,
      ...simCfnS3StatedFields({
        Date: simCfnS3LifecycleDate(TransitionDate),
        Days: TransitionInDays,
      }),
    };
  });
}
