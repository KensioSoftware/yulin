import { SimSesUnsupportedOperationException } from "../../error/sim-ses.error.js";
import type { SimSesTemplate } from "../../template/sim-ses-template.js";
import type { SimSesTemplateMetadata } from "./template.command.js";

/**
 * What ListEmailTemplates reports about one template.
 */
export function simSesTemplateMetadata(
  template: SimSesTemplate,
): SimSesTemplateMetadata {
  return {
    TemplateName: template.templateName,
    CreatedTimestamp: template.createdDate,
  };
}

/**
 * Refuse tags on a template, which this simulation does not hold.
 *
 * An empty list is accepted: code that always passes its tags is not using the
 * feature when it has none.
 */
export function refuseSimSesTemplateTags(
  tags: readonly unknown[] | undefined,
): void {
  if (tags !== undefined && tags.length > 0) {
    throw new SimSesUnsupportedOperationException(
      "Email template tags are not simulated, so CreateEmailTemplate " +
        "refuses them rather than dropping them",
    );
  }
}
