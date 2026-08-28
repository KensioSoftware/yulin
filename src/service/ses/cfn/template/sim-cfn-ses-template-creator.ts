import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSesV2 } from "../../sim-ses-v2.js";
import type { SimSesTemplate } from "../../template/sim-ses-template.js";
import { simCfnSesResourceCreation } from "../sim-cfn-ses-resource-error.js";
import { sesTemplateResourceType } from "../sim-cfn-ses-resource-types.js";
import { SimCfnSesTemplateProperties } from "./sim-cfn-ses-template-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnSesTemplateCreatorProperties {
  readonly ses: SimSesV2;
}

/**
 * Creates simulated email templates from AWS::SES::Template Resources.
 *
 * The template goes through the ordinary CreateEmailTemplate command, so one a
 * stack deployed is rendered by exactly the same code as one an SDK caller
 * made. That is what makes a template carrying Handlebars this simulation does
 * not render fail the deploy rather than sit in the stack waiting to fail at
 * the first send.
 */
export class SimCfnSesTemplateCreator {
  readonly #ses: SimSesV2;

  constructor(properties: SimCfnSesTemplateCreatorProperties) {
    this.#ses = properties.ses;
  }

  /**
   * Create a template from an AWS::SES::Template Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimSesTemplate> {
    const templateProperties = new SimCfnSesTemplateProperties({
      resource,
      properties,
    });
    const templateName = templateProperties.templateName();
    const content = templateProperties.content();

    templateProperties.recordIgnoredProperties();

    return await simCfnSesResourceCreation(
      sesTemplateResourceType,
      resource.logicalId,
      async () => {
        await this.#ses.createEmailTemplate(
          { input: { TemplateName: templateName, TemplateContent: content } },
          options,
        );

        const template = this.#ses.findTemplate(templateName);

        assertDefined(
          template,
          `sim SES template ${templateName} after CloudFormation creation`,
        );

        return template;
      },
    );
  }

  /**
   * Delete a template created from an AWS::SES::Template Resource.
   */
  async delete(
    template: SimSesTemplate,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#ses.deleteEmailTemplate(
      { input: { TemplateName: template.templateName } },
      options,
    );
  }
}
