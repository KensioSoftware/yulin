/**
 * Minimal structural sim ELBv2 rule condition configuration holding values.
 */
export interface SimElbV2ConditionValues {
  readonly Values?: readonly string[] | undefined;
}

/**
 * Minimal structural sim ELBv2 HTTP header condition configuration.
 */
export interface SimElbV2HttpHeaderConditionConfig {
  readonly HttpHeaderName?: string | undefined;
  readonly Values?: readonly string[] | undefined;
}

/**
 * Minimal structural sim ELBv2 query string key and value pair.
 */
export interface SimElbV2QueryStringKeyValuePair {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 query string condition configuration.
 */
export interface SimElbV2QueryStringConditionConfig {
  readonly Values?: readonly SimElbV2QueryStringKeyValuePair[] | undefined;
}

/**
 * Minimal structural sim ELBv2 rule condition.
 *
 * ELB takes a condition's values in two forms, a plain `Values` list and a
 * per-field configuration, and a rule written by a stack may use either.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_RuleCondition.html
 */
export interface SimElbV2RuleConditionInput {
  readonly Field?: string | undefined;
  readonly Values?: readonly string[] | undefined;
  readonly HostHeaderConfig?: SimElbV2ConditionValues | undefined;
  readonly PathPatternConfig?: SimElbV2ConditionValues | undefined;
  readonly HttpRequestMethodConfig?: SimElbV2ConditionValues | undefined;
  readonly SourceIpConfig?: SimElbV2ConditionValues | undefined;
  readonly HttpHeaderConfig?: SimElbV2HttpHeaderConditionConfig | undefined;
  readonly QueryStringConfig?: SimElbV2QueryStringConditionConfig | undefined;
}
