import type { SimLogsServiceWriter } from "../../../logs/write/sim-logs-service-writer.js";

interface SimLambdaLogWriterProperties {
  readonly logGroupName: string;
  readonly logStreamName: string;
  readonly logs: SimLogsServiceWriter;
}

/**
 * Records one execution environment's output into its log stream.
 *
 * Output is written line by line because that is what a log event is. Real
 * CloudWatch Logs records one event per line, so a handler printing a
 * multi-line object gets several events, and a test filtering for one of those
 * lines finds it.
 */
export class SimLambdaLogWriter {
  readonly #logGroupName: string;
  readonly #logStreamName: string;
  readonly #logs: SimLogsServiceWriter;
  #pending = "";

  constructor(properties: SimLambdaLogWriterProperties) {
    this.#logGroupName = properties.logGroupName;
    this.#logStreamName = properties.logStreamName;
    this.#logs = properties.logs;
    this.#logs.openStream(this.#logGroupName, this.#logStreamName);
  }

  /**
   * Record what the handler wrote.
   *
   * A chunk is whatever reached the stream, which need not be a whole line: a
   * handler writing to `process.stdout` directly can send one line in several
   * writes. What is left over after the last newline is held back until the
   * write that completes it, so a line is never split across two events.
   */
  write(chunk: string): void {
    const text = this.#pending + chunk;
    const lastNewline = text.lastIndexOf("\n");

    if (lastNewline === -1) {
      this.#pending = text;
      return;
    }

    this.#pending = text.slice(lastNewline + 1);
    this.#logs.write(
      this.#logGroupName,
      this.#logStreamName,
      text.slice(0, lastNewline).split("\n"),
    );
  }

  /**
   * Record anything written without a closing newline.
   *
   * Real Lambda records what the handler wrote when the invocation ends, so a
   * `process.stdout.write("no newline")` still reaches the log group rather
   * than waiting for a line that never comes.
   */
  flush(): void {
    if (this.#pending.length === 0) {
      return;
    }

    const pending = this.#pending;

    this.#pending = "";
    this.#logs.write(this.#logGroupName, this.#logStreamName, [pending]);
  }
}
