import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSesAlreadyExistsException,
  SimSesBadRequestException,
  SimSesNotFoundException,
} from "../error/sim-ses.error.js";
import type { SimSesTemplateContent } from "./sim-ses-template-content.js";
import { SimSesTemplate } from "./sim-ses-template.js";

const maximumNameLength = 64;

interface SimSesTemplateStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The email templates of one simulated SES scope.
 *
 * Templates are region scoped on real SES, as identities are: a template
 * created in one region cannot be sent from another, which is a mistake worth
 * reproducing rather than smoothing over.
 */
export class SimSesTemplateStore {
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #templates = new Map<string, SimSesTemplate>();

  constructor(properties: SimSesTemplateStoreProperties) {
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Every template in this scope, in the order they were created.
   */
  get all(): readonly SimSesTemplate[] {
    return this.#templates.values().toArray();
  }

  /**
   * Make a template, refusing a name that is taken.
   */
  create(
    templateName: string,
    content: SimSesTemplateContent,
    createdDate: Date,
  ): SimSesTemplate {
    if (this.#templates.has(templateName)) {
      throw new SimSesAlreadyExistsException(
        `Email template ${templateName} already exists.`,
      );
    }

    const template = new SimSesTemplate({
      templateName,
      content,
      accountRegionScope: this.#accountRegionScope,
      createdDate,
    });

    this.#templates.set(templateName, template);

    return template;
  }

  /**
   * Find a template by name.
   */
  find(templateName: string): SimSesTemplate | undefined {
    return this.#templates.get(templateName);
  }

  /**
   * Get a template, refusing one that is not there.
   */
  require(templateName: string): SimSesTemplate {
    const template = this.find(templateName);

    if (template === undefined) {
      throw new SimSesNotFoundException(
        `Email template ${templateName} does not exist.`,
      );
    }

    return template;
  }

  /**
   * Remove a template.
   */
  delete(templateName: string): void {
    this.#templates.delete(templateName);
  }
}

/**
 * Read a template name, refusing one real SES would refuse.
 *
 * Template names are matched exactly, unlike identities: there is no case
 * folding and no domain to fall back on, so `Welcome` and `welcome` are two
 * templates.
 */
export function requiredSimSesTemplateName(templateName?: string): string {
  if (templateName === undefined || templateName.length === 0) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'templateName' failed to " +
        "satisfy constraint: Member must not be null",
    );
  }

  if (templateName.length > maximumNameLength) {
    throw new SimSesBadRequestException(
      `1 validation error detected: Value at 'templateName' failed to ` +
        `satisfy constraint: Member must have length less than or equal to ` +
        `${maximumNameLength}`,
    );
  }

  return templateName;
}
