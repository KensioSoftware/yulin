import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSesEmailTemplateContent } from "../../command/template/template.command.js";
import { simCfnSesResourceError } from "../sim-cfn-ses-resource-error.js";
import { sesTemplateResourceType } from "../sim-cfn-ses-resource-types.js";

const maximumNameLength = 64;

/** The parts of the wording this Resource is actually created from. */
const actedOnParts = new Set([
  "TemplateName",
  "SubjectPart",
  "TextPart",
  "HtmlPart",
]);

interface SimCfnSesTemplatePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SES::Template CloudFormation properties into the shape
 * CreateEmailTemplate takes.
 *
 * Everything a template Resource says is nested inside one `Template`
 * property, which is unusual for a CloudFormation Resource and is why this
 * reads a record out of a record.
 */
export class SimCfnSesTemplateProperties {
  readonly #resource: SimCfnResource;
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #template: ReadonlyMap<string, SimCfnTemplateValue>;
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnSesTemplatePropertiesProperties) {
    this.#resource = properties.resource;
    this.#properties = properties.properties;
    this.#ignorer = properties.resource;
    this.#template = new Map(
      Object.entries(this.readTemplate(properties.properties)),
    );
  }

  /**
   * Record the properties the template is created without acting on.
   *
   * Everything a template Resource can usefully say is wording, so in practice
   * this catches a misspelling: `TextPart` written `Textpart` would otherwise
   * be dropped in silence and the message would go out with a missing body and
   * nothing to explain it. Both levels are walked, since a stray property can
   * sit beside `Template` as well as inside it.
   */
  recordIgnoredProperties(): void {
    for (const name of Object.keys(this.#properties)) {
      if (name !== "Template") {
        this.#ignorer.ignoreProperty(name, this.unreadReason(name));
      }
    }

    for (const name of this.#template.keys()) {
      if (!actedOnParts.has(name)) {
        this.#ignorer.ignoreProperty(
          `Template.${name}`,
          this.unreadReason(`Template.${name}`),
        );
      }
    }
  }

  /**
   * The template name.
   *
   * An unnamed template is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  templateName(): string {
    const name = this.stringPart("TemplateName");

    if (name === undefined) {
      return new SimCfnGeneratedResourceName({
        stackName: this.#resource.stackName,
        logicalId: this.#resource.logicalId,
        maximumLength: maximumNameLength,
      }).value;
    }

    return name;
  }

  /**
   * The wording, in the shape CreateEmailTemplate takes it.
   *
   * A part the template does not set is left out rather than sent as an empty
   * string, so a template with only a text body reports no HTML part rather
   * than an empty one.
   */
  content(): SimSesEmailTemplateContent {
    return {
      Subject: this.stringPart("SubjectPart"),
      Text: this.stringPart("TextPart"),
      Html: this.stringPart("HtmlPart"),
    };
  }

  /**
   * One part of the wording, or nothing where the template does not set it.
   *
   * The names are mapped at the call sites above rather than through a table,
   * because the two APIs disagree and it is worth being able to see which is
   * which: `AWS::SES::Template` kept the names the older SES API used, so a
   * template says `SubjectPart` where `CreateEmailTemplate` says `Subject`.
   */
  private stringPart(name: string): string | undefined {
    const value = this.#template.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.propertyError(`Template.${name} must be a string`);
    }

    return value;
  }

  private unreadReason(path: string): string {
    return (
      `${path} is not a property simulated SES reads from ` +
      `${sesTemplateResourceType}, so the template is created without it`
    );
  }

  private readTemplate(
    properties: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValueRecord {
    const template = properties["Template"];

    if (template === undefined) {
      throw this.propertyError("Template is required");
    }

    if (
      typeof template !== "object" ||
      template === null ||
      Array.isArray(template)
    ) {
      throw this.propertyError("Template must be an object");
    }

    return template;
  }

  private propertyError(reason: string): Error {
    return simCfnSesResourceError(
      sesTemplateResourceType,
      this.#resource.logicalId,
      reason,
    );
  }
}
