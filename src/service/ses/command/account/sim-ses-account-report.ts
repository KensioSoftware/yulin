import type { SimSesAccount } from "../../account/sim-ses-account.js";
import type {
  SimGetAccountCommandOutput,
  SimSesAccountDetailsOutput,
} from "./account.command.js";

interface SimSesAccountReportInput {
  readonly account: SimSesAccount;

  /** How many messages this scope accepted in the last 24 hours. */
  readonly sentLast24Hours: number;
}

/**
 * What `GetAccount` reports about one simulated SES account.
 *
 * The quota figures are the real sandbox and production ones and nothing here
 * enforces them: `SentLast24Hours` counts what was actually sent, and a send
 * past the daily figure still succeeds.
 *
 * `EnforcementStatus` is always `HEALTHY` and `SendingEnabled` always true,
 * because nothing here puts an account under enforcement or pauses its
 * sending.
 */
export function simSesAccountReport(
  input: SimSesAccountReportInput,
): SimGetAccountCommandOutput {
  const { account } = input;
  const quota = account.sendQuota;

  return {
    $metadata: {},
    DedicatedIpAutoWarmupEnabled: true,
    EnforcementStatus: "HEALTHY",
    ProductionAccessEnabled: account.productionAccessEnabled,
    SendingEnabled: true,
    SendQuota: {
      Max24HourSend: quota.max24HourSend,
      MaxSendRate: quota.maxSendRate,
      SentLast24Hours: input.sentLast24Hours,
    },
    Details: accountDetails(account),
  };
}

function accountDetails(
  account: SimSesAccount,
): SimSesAccountDetailsOutput | undefined {
  const details = account.contactDetails;

  if (details === undefined) {
    return undefined;
  }

  return {
    MailType: details.mailType,
    WebsiteURL: details.websiteUrl,
    ContactLanguage: details.contactLanguage,
    UseCaseDescription: details.useCaseDescription,
    AdditionalContactEmailAddresses: details.additionalContactEmailAddresses,
    ReviewDetails: {
      Status: account.productionAccessEnabled ? "GRANTED" : "PENDING",
    },
  };
}
