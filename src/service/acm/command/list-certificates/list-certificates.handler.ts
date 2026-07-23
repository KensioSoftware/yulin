import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import { ListCertificatesAuthorizer } from "./list-certificates-authorizer.js";
import type {
  SimListCertificatesCommand,
  SimListCertificatesCommandOutput,
} from "./list-certificates.cmd.js";
import { ListCertificatesPageBuilder } from "./list-certificates-page-builder.js";

interface ListCertificatesCommandHandlerProperties {
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface ListCertificatesCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated ACM ListCertificatesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/acm/command/ListCertificatesCommand/
 */
export class ListCertificatesCommandHandler implements CommandHandler<
  SimListCertificatesCommand,
  SimListCertificatesCommandOutput
> {
  private readonly authorizer: ListCertificatesAuthorizer;
  private readonly pageBuilder: ListCertificatesPageBuilder;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListCertificatesCommandHandlerProperties) {
    const {
      certificates,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.authorizer = new ListCertificatesAuthorizer({ iam });
    this.pageBuilder = new ListCertificatesPageBuilder({ certificates });
    this.background = background;
  }

  /**
   * Simulate listing ACM certificates.
   *
   * Background sequencing completes before authorization so command execution
   * retains the ordering used by other simulated service handlers.
   *
   * Authorization occurs before the page builder reads certificate state. ACM
   * treats ListCertificates as one operation and does not return a partial list
   * based on individual Certificate ARN permissions.
   *
   * Once authorization succeeds, page construction is delegated so this handler
   * remains responsible for request-level coordination and response metadata.
   */
  async handle(
    command: SimListCertificatesCommand,
    options?: ListCertificatesCommandHandlerOptions,
  ): Promise<SimListCertificatesCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(options?.caller);

    return {
      ...this.pageBuilder.build(command.input),
      $metadata: {},
    };
  }
}
