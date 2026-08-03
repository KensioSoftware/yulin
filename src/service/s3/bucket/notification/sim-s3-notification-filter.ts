import { SimS3InvalidArgument } from "../../error/sim-s3.error.js";
import type {
  SimS3NotificationFilterInput,
  SimS3NotificationFilterRuleInput,
} from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";

/**
 * The object key filter of one notification configuration.
 *
 * An absent prefix or suffix is held as an empty string rather than as
 * undefined, because that is what it means to S3: the root prefix matches every
 * key and overlaps every other prefix, and the same goes for the root suffix.
 */
export class SimS3NotificationFilter {
  public readonly prefix: string;
  public readonly suffix: string;

  constructor(prefix = "", suffix = "") {
    this.prefix = prefix;
    this.suffix = suffix;
  }

  /**
   * Read the filter of one notification configuration.
   *
   * A filter rule name S3 does not have is refused by name, as is a rule name
   * repeated twice, which real S3 refuses rather than taking the last one.
   */
  static fromInput(
    filter: SimS3NotificationFilterInput | undefined,
  ): SimS3NotificationFilter {
    const rules = filter?.Key?.FilterRules ?? [];
    const values = new Map<string, string>();

    for (const rule of rules) {
      const name = simS3NotificationFilterRuleName(rule);

      if (values.has(name)) {
        throw new SimS3InvalidArgument(
          `Filter rule ${name} is specified more than once in one ` +
            "notification configuration.",
        );
      }

      values.set(name, rule.Value ?? "");
    }

    return new SimS3NotificationFilter(
      values.get("prefix"),
      values.get("suffix"),
    );
  }

  /**
   * Whether an object key passes this filter.
   */
  matches(key: string): boolean {
    return key.startsWith(this.prefix) && key.endsWith(this.suffix);
  }

  /**
   * Whether some object key could pass both this filter and another.
   *
   * Two prefixes overlap when a key could begin with both, which is to say
   * when one is a prefix of the other, and two suffixes overlap on the same
   * reasoning at the other end. A filter pair only conflicts when both ends
   * overlap: `images` with `.jpg` and `images` with `.png` share a prefix but
   * no key ends both ways, which is why real S3 accepts that pair.
   */
  overlaps(other: SimS3NotificationFilter): boolean {
    return (
      this.prefixesOverlap(other.prefix) && this.suffixesOverlap(other.suffix)
    );
  }

  /**
   * This filter as a notification configuration reports it, or nothing when it
   * filters nothing.
   */
  toOutput(): SimS3NotificationFilterInput | undefined {
    const rules: SimS3NotificationFilterRuleInput[] = [];

    if (this.prefix !== "") {
      rules.push({ Name: "prefix", Value: this.prefix });
    }

    if (this.suffix !== "") {
      rules.push({ Name: "suffix", Value: this.suffix });
    }

    if (rules.length === 0) {
      return undefined;
    }

    return { Key: { FilterRules: rules } };
  }

  private prefixesOverlap(other: string): boolean {
    return this.prefix.startsWith(other) || other.startsWith(this.prefix);
  }

  private suffixesOverlap(other: string): boolean {
    return this.suffix.endsWith(other) || other.endsWith(this.suffix);
  }
}

/**
 * The filter rule name a rule names, refusing anything S3 does not filter on.
 *
 * The name is matched case-insensitively because the SDK and the REST XML
 * disagree about the capitalisation, while the value is taken as written.
 */
function simS3NotificationFilterRuleName(
  rule: SimS3NotificationFilterRuleInput,
): string {
  const name = (rule.Name ?? "").toLowerCase();

  if (name !== "prefix" && name !== "suffix") {
    throw new SimS3InvalidArgument(
      `Unsupported notification filter rule name ${rule.Name ?? "(none)"}. ` +
        "S3 filters object keys on prefix and suffix.",
    );
  }

  return name;
}
