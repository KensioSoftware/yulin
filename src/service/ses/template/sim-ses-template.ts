import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simSesTemplateArn } from "../sim-ses-arn.js";
import type { SimSesTemplateContent } from "./sim-ses-template-content.js";

interface SimSesTemplateProperties {
  readonly templateName: string;
  readonly content: SimSesTemplateContent;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdDate: Date;
}

/**
 * One stored email template.
 *
 * A template is the wording of a message with its placeholders still in it,
 * kept apart from the data that fills them. That separation is the reason a
 * test wants templates at all: it can assert which template went out and what
 * was substituted into it, rather than matching against rendered prose that
 * changes whenever someone rewords the email.
 */
export class SimSesTemplate {
  public readonly templateName: string;

  public readonly arn: string;

  public readonly createdDate: Date;

  #content: SimSesTemplateContent;

  constructor(properties: SimSesTemplateProperties) {
    this.templateName = properties.templateName;
    this.#content = properties.content;
    this.arn = simSesTemplateArn(
      properties.accountRegionScope,
      properties.templateName,
    );
    this.createdDate = properties.createdDate;
  }

  /**
   * The wording as it stands, with its placeholders unrendered.
   */
  get content(): SimSesTemplateContent {
    return this.#content;
  }

  /**
   * Replace the wording, keeping the name and the time it was created.
   *
   * Real SES updates a template in place rather than making a new one, so its
   * `CreatedTimestamp` does not move and a send that already named it picks up
   * the new wording.
   */
  update(content: SimSesTemplateContent): void {
    this.#content = content;
  }
}
