import { simLogsParsedLogGroupArn } from "../../../../logs/group/sim-logs-arn.js";
import type { SimHttpApiAccessLogSettingsView } from "./sim-http-api-access-log-settings.type.js";

interface SimHttpApiAccessLogSettingsProperties {
  readonly destinationArn: string;
  readonly format: string;
  readonly accountId: string;
  readonly regionName: string;
  readonly logGroupName: string;
}

/**
 * Where one stage writes its access log, and the line it writes there.
 *
 * The destination is held as the ARN the stage was created with and as the
 * account, region and group that ARN resolves to. A log group in another
 * Account is written to in that Account, the way an integration invokes the
 * function its own URI names.
 */
export class SimHttpApiAccessLogSettings {
  readonly destinationArn: string;
  readonly format: string;
  readonly accountId: string;
  readonly regionName: string;
  readonly logGroupName: string;

  private constructor(properties: SimHttpApiAccessLogSettingsProperties) {
    this.destinationArn = properties.destinationArn;
    this.format = properties.format;
    this.accountId = properties.accountId;
    this.regionName = properties.regionName;
    this.logGroupName = properties.logGroupName;
  }

  /**
   * Read settings from a destination ARN and a format, or answer with nothing
   * where the ARN names no log group.
   */
  static from(
    destinationArn: string,
    format: string,
  ): SimHttpApiAccessLogSettings | undefined {
    const parsed = simLogsParsedLogGroupArn(destinationArn);

    if (parsed === undefined) {
      return undefined;
    }

    return new SimHttpApiAccessLogSettings({
      destinationArn,
      format,
      ...parsed,
    });
  }

  /**
   * What CreateStage and GetStages report of these settings.
   */
  view(): SimHttpApiAccessLogSettingsView {
    return { DestinationArn: this.destinationArn, Format: this.format };
  }
}
