import type { SimSesAccountContactDetails } from "../../account/sim-ses-account.js";
import { SimSesBadRequestException } from "../../error/sim-ses.error.js";
import type { SimPutAccountDetailsCommandInput } from "./account.command.js";

/**
 * The mail types real SES accepts, and requires one of.
 */
const mailTypes = new Set(["MARKETING", "TRANSACTIONAL"]);

/**
 * Read the account details a request carries, refusing what real SES refuses.
 *
 * `MailType` and `WebsiteURL` are both required on real SES, which is easy to
 * miss: the request that only wants to leave the sandbox still has to say what
 * the account sends and where from.
 */
export function readSimSesAccountDetails(
  input: SimPutAccountDetailsCommandInput,
): SimSesAccountContactDetails {
  return {
    mailType: requiredMailType(input.MailType),
    websiteUrl: requiredWebsiteUrl(input.WebsiteURL),
    contactLanguage: input.ContactLanguage,
    useCaseDescription: input.UseCaseDescription,
    additionalContactEmailAddresses: input.AdditionalContactEmailAddresses,
  };
}

function requiredMailType(mailType: string | undefined): string {
  if (mailType === undefined || !mailTypes.has(mailType)) {
    throw new SimSesBadRequestException(
      `1 validation error detected: Value '${String(mailType)}' at ` +
        `'mailType' failed to satisfy constraint: Member must be one of ${[
          ...mailTypes,
        ].join(", ")}`,
    );
  }

  return mailType;
}

function requiredWebsiteUrl(websiteUrl: string | undefined): string {
  if (websiteUrl === undefined || websiteUrl.length === 0) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'websiteURL' failed to satisfy " +
        "constraint: Member must not be null",
    );
  }

  return websiteUrl;
}
