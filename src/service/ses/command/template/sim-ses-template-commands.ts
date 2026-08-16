import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { readSimSesTemplateContent } from "../../template/sim-ses-template-content.js";
import {
  requiredSimSesTemplateName,
  type SimSesTemplateStore,
} from "../../template/sim-ses-template-store.js";
import type { SimSesAuthorizer } from "../authorize/sim-ses-authorizer.js";
import { SimSesPage } from "../sim-ses-page.js";
import type { SimSesRequestOptions } from "../sim-ses-request-options.js";
import {
  refuseSimSesTemplateTags,
  simSesTemplateMetadata,
} from "./sim-ses-template-reporting.js";
import type {
  SimCreateEmailTemplateCommand,
  SimCreateEmailTemplateCommandOutput,
  SimDeleteEmailTemplateCommand,
  SimDeleteEmailTemplateCommandOutput,
  SimGetEmailTemplateCommand,
  SimGetEmailTemplateCommandOutput,
  SimListEmailTemplatesCommand,
  SimListEmailTemplatesCommandOutput,
  SimUpdateEmailTemplateCommand,
  SimUpdateEmailTemplateCommandOutput,
} from "./template.command.js";

interface SimSesTemplateCommandsProperties {
  readonly templates: SimSesTemplateStore;
  readonly authorizer: SimSesAuthorizer;
  readonly clock: SimClock;
}

/**
 * The commands that make, read, list, change and remove email templates.
 *
 * Every one of them but the listing names a template, and each authorizes
 * against that template's ARN, so a policy can allow a caller to manage one
 * template and not the others.
 */
export class SimSesTemplateCommands {
  readonly #templates: SimSesTemplateStore;
  readonly #authorizer: SimSesAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimSesTemplateCommandsProperties) {
    this.#templates = properties.templates;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * Store a template.
   */
  createEmailTemplate(
    command: SimCreateEmailTemplateCommand,
    options?: SimSesRequestOptions,
  ): SimCreateEmailTemplateCommandOutput {
    refuseSimSesTemplateTags(command.input.Tags);

    this.#templates.create(
      this.named("ses:CreateEmailTemplate", command.input, options),
      readSimSesTemplateContent(command.input.TemplateContent ?? {}),
      this.#clock.now(),
    );

    return { $metadata: {} };
  }

  /**
   * Read a template's wording, with its placeholders unrendered.
   */
  getEmailTemplate(
    command: SimGetEmailTemplateCommand,
    options?: SimSesRequestOptions,
  ): SimGetEmailTemplateCommandOutput {
    const template = this.#templates.require(
      this.named("ses:GetEmailTemplate", command.input, options),
    );

    return {
      $metadata: {},
      TemplateName: template.templateName,
      TemplateContent: {
        Subject: template.content.subject,
        Text: template.content.text,
        Html: template.content.html,
      },
    };
  }

  /**
   * Replace a template's wording, refusing one that is not there.
   */
  updateEmailTemplate(
    command: SimUpdateEmailTemplateCommand,
    options?: SimSesRequestOptions,
  ): SimUpdateEmailTemplateCommandOutput {
    this.#templates
      .require(this.named("ses:UpdateEmailTemplate", command.input, options))
      .update(readSimSesTemplateContent(command.input.TemplateContent ?? {}));

    return { $metadata: {} };
  }

  /**
   * List the templates in this scope, in the order they were created.
   *
   * Real SES gives this action no resource type, so it authorizes against `*`
   * as the other listings do.
   */
  listEmailTemplates(
    command: SimListEmailTemplatesCommand,
    options?: SimSesRequestOptions,
  ): SimListEmailTemplatesCommandOutput {
    this.#authorizer.authorizeNoResource(
      "ses:ListEmailTemplates",
      options?.caller,
    );

    const page = new SimSesPage({
      listed: this.#templates.all,
      pageSize: command.input.PageSize,
      nextToken: command.input.NextToken,
    });

    return {
      $metadata: {},
      TemplatesMetadata: page.items.map((template) =>
        simSesTemplateMetadata(template),
      ),
      NextToken: page.nextToken,
    };
  }

  /**
   * Remove a template, refusing one that is not there.
   */
  deleteEmailTemplate(
    command: SimDeleteEmailTemplateCommand,
    options?: SimSesRequestOptions,
  ): SimDeleteEmailTemplateCommandOutput {
    const templateName = this.named(
      "ses:DeleteEmailTemplate",
      command.input,
      options,
    );

    this.#templates.require(templateName);
    this.#templates.delete(templateName);

    return { $metadata: {} };
  }

  /**
   * The template name a request carries, once it is one SES would accept and
   * the caller is allowed to act on it.
   *
   * The template need not exist. Real IAM decides a request before the service
   * looks at it, so CreateEmailTemplate authorizes against the ARN the
   * template is about to have, and the rest refuse a caller with no permission
   * whether or not the template is there.
   */
  private named(
    action: string,
    input: { readonly TemplateName?: string | undefined },
    options: SimSesRequestOptions | undefined,
  ): string {
    const templateName = requiredSimSesTemplateName(input.TemplateName);

    this.#authorizer.authorizeTemplate(action, templateName, options?.caller);

    return templateName;
  }
}
