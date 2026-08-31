import {
  SimSesBadRequestException,
  SimSesUnsupportedOperationException,
} from "../../error/sim-ses.error.js";
import { renderSimSesTemplatePart } from "../../template/sim-ses-render.js";
import { readSimSesTemplateContent } from "../../template/sim-ses-template-content.js";
import type { SimSesTemplateContent } from "../../template/sim-ses-template-content.js";
import type { SimSesTemplateStore } from "../../template/sim-ses-template-store.js";
import type { SimSesReadContent } from "./sim-ses-read-content.js";
import type { SimSesTemplate } from "./send.command.js";

interface SimSesTemplateSendReaderProperties {
  readonly templates: SimSesTemplateStore;
}

/**
 * Renders the template branch of a send.
 *
 * The wording comes either from a template stored under a name or from one
 * written into the request itself, both of which real SES accepts. What comes
 * back is the rendered message plus the name and data it was rendered from, so
 * the recorded send can carry all three.
 */
export class SimSesTemplateSendReader {
  readonly #templates: SimSesTemplateStore;

  constructor(properties: SimSesTemplateSendReaderProperties) {
    this.#templates = properties.templates;
  }

  /**
   * Render a template send, refusing one SES would refuse.
   */
  read(template: SimSesTemplate): SimSesReadContent {
    if (template.TemplateArn !== undefined) {
      throw new SimSesUnsupportedOperationException(
        "Sending another Account's shared template is not simulated, so " +
          "SendEmail refuses TemplateArn rather than rendering a template it " +
          "cannot read",
      );
    }

    if (template.Attachments !== undefined || template.Headers !== undefined) {
      throw new SimSesUnsupportedOperationException(
        "Attachments and custom headers are not simulated, so SendEmail " +
          "refuses them rather than recording a message without them",
      );
    }

    const content = this.resolveContent(template);
    const data = readTemplateData(template.TemplateData);

    return {
      subject: render(content.subject, data),
      body: {
        text: renderOptional(content.text, data),
        html: renderOptional(content.html, data),
      },
      attachments: [],
      templateName: template.TemplateName,
      templateData: data,
    };
  }

  /**
   * The wording to render: the stored template's, or the one the send wrote
   * out in full.
   *
   * A send naming both is refused rather than picking one. Which of them real
   * SES prefers is not something this simulator knows, and rendering the
   * inline wording while recording the stored template's name would put a
   * message in the record under a template it was not rendered from.
   */
  private resolveContent(template: SimSesTemplate): SimSesTemplateContent {
    if (template.TemplateContent !== undefined) {
      if (template.TemplateName !== undefined) {
        throw new SimSesUnsupportedOperationException(
          "A send naming both TemplateName and TemplateContent is refused: " +
            "which of them real SES renders is not simulated here",
        );
      }

      return readSimSesTemplateContent(template.TemplateContent);
    }

    if (template.TemplateName === undefined) {
      throw new SimSesBadRequestException(
        "1 validation error detected: Value at 'content.template' failed to " +
          "satisfy constraint: Member must specify TemplateName or " +
          "TemplateContent",
      );
    }

    return this.#templates.require(template.TemplateName).content;
  }
}

/**
 * Read the JSON a send fills its placeholders from.
 *
 * An absent `TemplateData` is an empty object rather than a failure, which is
 * how real SES treats it: every placeholder then renders empty.
 */
function readTemplateData(
  templateData: string | undefined,
): Readonly<Record<string, unknown>> {
  if (templateData === undefined) {
    return {};
  }

  const parsed: unknown = parseJson(templateData);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SimSesBadRequestException(
      "The template data is not a JSON object.",
    );
  }

  return parsed as Record<string, unknown>;
}

function parseJson(templateData: string): unknown {
  try {
    return JSON.parse(templateData);
  } catch {
    throw new SimSesBadRequestException("The template data is invalid JSON.");
  }
}

/**
 * A template with no subject renders an empty one, which is what a message
 * sent without a Subject header amounts to.
 */
function render(
  part: string | undefined,
  data: Readonly<Record<string, unknown>>,
): string {
  return part === undefined ? "" : renderSimSesTemplatePart(part, data);
}

function renderOptional(
  part: string | undefined,
  data: Readonly<Record<string, unknown>>,
): string | undefined {
  return part === undefined ? undefined : renderSimSesTemplatePart(part, data);
}
