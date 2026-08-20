import type { SimCreateRegexPatternSetCommandInput } from "../../command/regex-pattern-set/regex-pattern-set.command.js";
import { SimCfnWafResourceConfig } from "../sim-cfn-waf-resource-config.js";
import { wafRegexPatternSetResourceType } from "../sim-cfn-waf-resource-types.js";

/**
 * Reads an AWS::WAFv2::RegexPatternSet Resource into what
 * CreateRegexPatternSet takes.
 *
 * This is the one place where CloudFormation and the API disagree about the
 * shape of a WAFv2 resource. `RegularExpressionList` is a list of strings in a
 * template and a list of `{ RegexString }` objects in the API, so the patterns
 * are wrapped on the way through rather than passed along.
 */
export class SimCfnWafRegexPatternSetConfig extends SimCfnWafResourceConfig {
  protected override get resourceType(): string {
    return wafRegexPatternSetResourceType;
  }

  /**
   * The input the pattern set this Resource describes is created from.
   */
  createInput(): SimCreateRegexPatternSetCommandInput {
    return {
      Name: this.name(),
      Scope: this.scope(),
      Description: this.description(),
      RegularExpressionList: this.requiredStrings("RegularExpressionList").map(
        (pattern) => ({ RegexString: pattern }),
      ),
    };
  }
}
