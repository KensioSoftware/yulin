import { parseDocument, type YAMLError } from "yaml";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { CfnTemplateBodyRecord } from "../sim-cfn-template.js";
import { simCfnYamlShortFormTags } from "./sim-cfn-yaml-short-forms.js";

/**
 * What a YAML parser calls a tag it has no entry for.
 *
 * A YAML parser calls that a warning and carries on with the value the tag was
 * written against, which would read `!Base64 secret` as the string `secret`.
 * It is a failure here, the way the long form of an intrinsic this simulation
 * has no behaviour for fails the template that calls it.
 */
const UNRESOLVED_TAG = "TAG_RESOLVE_FAILED";

/**
 * Parse a CloudFormation template written as YAML.
 *
 * What comes back is the template object the same infrastructure written as
 * JSON parses to, with short-form intrinsic tags resolved to the objects their
 * long forms are written as. Everything downstream reads one template shape,
 * whichever format the template arrived in.
 */
export function parseSimCfnTemplateYaml(body: string): CfnTemplateBodyRecord {
  const document = parseDocument(body, {
    customTags: simCfnYamlShortFormTags(),
  });

  const failures = [
    ...document.errors,
    ...document.warnings.filter((warning) => warning.code === UNRESOLVED_TAG),
  ];

  if (failures.length > 0) {
    throw new Error(failureMessage(failures));
  }

  const template: unknown = document.toJS();

  if (!isRecord(template)) {
    throw new TypeError("a template must be a mapping of template sections");
  }

  return template as CfnTemplateBodyRecord;
}

function failureMessage(failures: readonly YAMLError[]): string {
  return failures.map((failure) => failure.message).join("; ");
}
