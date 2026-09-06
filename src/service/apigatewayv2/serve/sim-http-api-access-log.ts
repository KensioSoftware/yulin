import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import { simHttpApiAccessLogLine } from "../api/stage/access-log/sim-http-api-access-log-format.js";
import type { SimHttpApiAccessLogRequest } from "../api/stage/access-log/sim-http-api-access-log-request.js";
import { simHttpApiAccessLogStreamName } from "../api/stage/access-log/sim-http-api-access-log-stream-name.js";
import { simHttpApiAccessLogVariables } from "../api/stage/access-log/sim-http-api-access-log-variables.js";
import type { SimHttpApiStage } from "../api/stage/sim-http-api-stage.js";
import { simHttpApiAccessLogRecord } from "./sim-http-api-access-log-record.js";
import type { SimHttpApiServed } from "./sim-http-api-served.js";
import type { SimHttpApiServing } from "./sim-http-api-serving.js";

interface SimHttpApiAccessLogProperties {
  readonly simAws: SimAws;
  readonly clock: SimClock;
}

/**
 * Writes a stage's access log line for one request.
 *
 * The line goes to the log group alone. Sim Lambda forwards a handler's output
 * to the host console as well, and an API answering a few hundred requests in
 * one test file would bury the suite's own output the same way. Writing
 * through `SimLogsServiceWriter` keeps it out of the console, and a test reads
 * the lines back with `FilterLogEvents`.
 *
 * Nothing here fails. A destination log group that was never declared is
 * created by the write, and a stage with no access log settings writes
 * nothing, which is how a request is served whether or not anybody is logging
 * it.
 */
export class SimHttpApiAccessLog {
  readonly #simAws: SimAws;
  readonly #clock: SimClock;

  constructor(properties: SimHttpApiAccessLogProperties) {
    this.#simAws = properties.simAws;
    this.#clock = properties.clock;
  }

  /**
   * Record one finished request against the stage that served it.
   *
   * A stage with no access log settings does nothing here, including none of
   * the measuring a line needs. The response body is measured from a clone,
   * since the one the client gets still has to be readable, and the latency is
   * simulated milliseconds, so a test holding the clock logs a latency of zero
   * rather than however long the process happened to take.
   */
  async served(
    serving: SimHttpApiServing,
    request: Request,
    served: SimHttpApiServed,
    at: Date,
  ): Promise<void> {
    const { match, requestId = "" } = serving;

    if (match.stage.accessLogSettings === undefined) {
      return;
    }

    const body = await served.response.clone().arrayBuffer();

    this.record(
      match.stage,
      simHttpApiAccessLogRecord({
        serving,
        requestId,
        request,
        response: served.response,
        responseLength: body.byteLength,
        responseLatency: this.#clock.now().getTime() - at.getTime(),
        at,
        ...(served.authorization !== undefined && {
          authorization: served.authorization,
        }),
        ...(served.integration !== undefined && {
          integration: served.integration,
        }),
      }),
    );
  }

  /**
   * Record one described request against the stage that served it.
   */
  record(stage: SimHttpApiStage, request: SimHttpApiAccessLogRequest): void {
    const settings = stage.accessLogSettings;

    if (settings === undefined) {
      return;
    }

    const line = simHttpApiAccessLogLine(
      settings.format,
      simHttpApiAccessLogVariables(request),
    );

    this.#simAws
      .accountRegionScope(
        settings.accountId as SimAwsAccountId,
        settings.regionName as AwsRegionName,
      )
      .logs()
      .serviceWriter()
      .write(
        settings.logGroupName,
        simHttpApiAccessLogStreamName(this.#clock),
        [line],
      );
  }
}
