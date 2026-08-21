import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimSesAccount } from "./account/sim-ses-account.js";
import { SimSesAccountCommands } from "./command/account/sim-ses-account-commands.js";
import { SimSesAuthorizer } from "./command/authorize/sim-ses-authorizer.js";
import { SimSesIdentityCommands } from "./command/identity/sim-ses-identity-commands.js";
import { SimSesContentReader } from "./command/send/sim-ses-content.js";
import { SimSesSendEmail } from "./command/send/sim-ses-send-email.js";
import { SimSesSuppressionCheck } from "./command/send/sim-ses-suppression-check.js";
import { SimSesVerifiedIdentityCheck } from "./command/send/sim-ses-verified-identities.js";
import { SimSesSuppressionCommands } from "./command/suppression/sim-ses-suppression-commands.js";
import { SimSesSuppressionList } from "./suppression/sim-ses-suppression-list.js";
import { SimSesSentEmailStore } from "./email/sim-ses-sent-email-store.js";
import { SimSesIdentityStore } from "./identity/sim-ses-identity-store.js";
import { SimSesTemplateCommands } from "./command/template/sim-ses-template-commands.js";
import { SimSesTemplateStore } from "./template/sim-ses-template-store.js";

export interface SimSesV2Properties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * The collaborators one simulated SES scope is built from.
 *
 * Held apart from SimSesV2 for the same reason simulated CloudWatch Logs holds
 * its own: the facade is one method per SDK Command and grows by one with
 * every operation added, so the wiring deciding what those methods delegate to
 * needs somewhere it is not competing for room with them.
 */
export class SimSesCommands {
  readonly identities: SimSesIdentityStore;
  readonly templates: SimSesTemplateStore;
  readonly sent: SimSesSentEmailStore;
  readonly account: SimSesAccount;
  readonly suppression: SimSesSuppressionList;
  readonly identityCommands: SimSesIdentityCommands;
  readonly templateCommands: SimSesTemplateCommands;
  readonly sendEmail: SimSesSendEmail;
  readonly accountCommands: SimSesAccountCommands;
  readonly suppressionCommands: SimSesSuppressionCommands;
  readonly background: BackgroundScheduler;

  constructor(properties: SimSesV2Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimSesAuthorizer({ iam, accountRegionScope });
    const identities = new SimSesIdentityStore({ accountRegionScope });
    const templates = new SimSesTemplateStore({ accountRegionScope });
    const sent = new SimSesSentEmailStore();
    const account = new SimSesAccount();
    const suppression = new SimSesSuppressionList();

    this.background = background;
    this.identities = identities;
    this.templates = templates;
    this.sent = sent;
    this.account = account;
    this.suppression = suppression;
    this.identityCommands = new SimSesIdentityCommands({
      identities,
      authorizer,
      clock: background,
    });
    this.templateCommands = new SimSesTemplateCommands({
      templates,
      authorizer,
      clock: background,
    });
    this.sendEmail = new SimSesSendEmail({
      identities,
      content: new SimSesContentReader({ templates }),
      sent,
      identityCheck: new SimSesVerifiedIdentityCheck({
        identities,
        account,
        accountRegionScope,
      }),
      suppressionCheck: new SimSesSuppressionCheck({ suppression, account }),
      authorizer,
      clock: background,
    });
    this.accountCommands = new SimSesAccountCommands({
      account,
      sent,
      authorizer,
      clock: background,
    });
    this.suppressionCommands = new SimSesSuppressionCommands({
      suppression,
      authorizer,
      clock: background,
    });
  }
}
