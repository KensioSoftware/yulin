import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimLogsServiceWriter } from "../../../logs/write/sim-logs-service-writer.js";
import type { SimLambdaExecutableCode } from "../code/sim-lambda-executable-code.js";
import { SimLambdaLogWriter } from "./sim-lambda-log-writer.js";
import {
  simLambdaLogGroupName,
  simLambdaLogStreamName,
} from "./sim-lambda-log-stream-name.js";

interface SimLambdaFunctionLoggingProperties {
  readonly functionName: string;
  readonly clock: SimClock;

  /**
   * Where output is recorded. A function built standalone, outside a SimAws
   * instance, has no simulated CloudWatch Logs to record to.
   */
  readonly logs?: SimLogsServiceWriter | undefined;
}

/**
 * One function's side of writing its output to a log group.
 *
 * The group and stream names exist whether or not anything is recording, since
 * real Lambda derives both from the function and its execution environment and
 * a handler reads them from its context either way. What a missing simulated
 * CloudWatch Logs changes is only whether a stream is opened behind them.
 *
 * Both names are settled once, on the first invocation, and reused after it.
 * That is what an execution environment does: it cold starts, opens a stream,
 * and keeps writing to it. Yulin does not recycle execution environments, so a
 * function keeps one stream for as long as the function exists, and a new
 * simulation opens a new one.
 */
export class SimLambdaFunctionLogging {
  readonly logGroupName: string;

  readonly #logs: SimLogsServiceWriter | undefined;
  readonly #clock: SimClock;
  #writer: SimLambdaLogWriter | undefined;
  #logStreamName: string | undefined;

  constructor(properties: SimLambdaFunctionLoggingProperties) {
    this.logGroupName = simLambdaLogGroupName(properties.functionName);
    this.#logs = properties.logs;
    this.#clock = properties.clock;
  }

  /**
   * The stream this function's execution environment writes to, opening it if
   * this is the first invocation.
   *
   * The group and stream are reopened on every invocation, not just the first.
   * Opening is idempotent, and a test that deleted the log group in between
   * would otherwise get it back only if the next handler happened to write
   * something: real Lambda shows the stream for an invocation that logged
   * nothing at all.
   */
  logStreamName(): string {
    this.#logStreamName ??= this.coldStart();
    this.#logs?.openStream(this.logGroupName, this.#logStreamName);

    return this.#logStreamName;
  }

  /**
   * Have this function's code record what it writes.
   */
  recordFrom(code: SimLambdaExecutableCode): void {
    const writer = this.#writer;

    if (writer !== undefined) {
      code.recordOutputTo(writer);
    }
  }

  /**
   * Run an invocation, recording whatever it left unterminated once it is
   * over.
   *
   * The flush happens whether the handler returned or threw, because a handler
   * that logged and then failed is the one a test most wants to read the logs
   * of, and real Lambda records the output either way.
   */
  async around<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } finally {
      this.#writer?.flush();
    }
  }

  private coldStart(): string {
    const logStreamName = simLambdaLogStreamName(this.#clock);
    const logs = this.#logs;

    if (logs !== undefined) {
      this.#writer = new SimLambdaLogWriter({
        logGroupName: this.logGroupName,
        logStreamName,
        logs,
      });
    }

    return logStreamName;
  }
}
