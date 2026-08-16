import { Writable } from "node:stream";
import {
  simLambdaNoOutputSink,
  type SimLambdaOutputSink,
} from "../../logging/sim-lambda-output-sink.js";

/**
 * One of the standard output streams the sim Lambda vm sandbox gives function
 * code as `process.stdout` and `process.stderr`.
 *
 * Real Lambda gives function code writable standard streams, and libraries
 * build their own console over them rather than the global one, so that
 * console patching cannot affect their output. AWS Lambda Powertools' logger
 * does exactly that, at module scope:
 *
 * ```javascript
 * new Console({ stdout: process.stdout, stderr: process.stderr })
 * ```
 *
 * Without the streams that construction throws
 * (`ERR_CONSOLE_WRITABLE_STREAM`) before the handler runs.
 *
 * What function code writes is forwarded to the matching host stream,
 * standard output to standard output and standard error to standard error, and
 * recorded to the sink the code was given, which is what puts a handler's
 * output in its log group. Forwarding to the host is a tee rather than a
 * redirect: real Lambda sends output to CloudWatch Logs and nowhere else, but
 * a test tool that swallowed it would make a failing test harder to debug than
 * it is with none of this.
 * The sandbox's own console is built over these streams too, so a handler's
 * output arrives there whether it printed through the console or wrote to the
 * stream itself, instead of one of the two disappearing. The host stream is
 * read per write, so a test that starts capturing host output after the
 * function has cold-started still sees what the handler writes.
 */
export class SimLambdaVmOutputStream extends Writable {
  #sink: SimLambdaOutputSink = simLambdaNoOutputSink;

  constructor(private readonly hostStream: () => NodeJS.WritableStream) {
    super();
  }

  /**
   * Record everything written here to a sink from now on.
   */
  recordTo(sink: SimLambdaOutputSink): void {
    this.#sink = sink;
  }

  /**
   * The write is handed on and reported as done without waiting for the host
   * stream, as Node.js's own console hands writes to process.stdout. Waiting
   * would make a failed log write fail the code that logged: reporting the
   * host's error here destroys this stream, and with nothing listening for
   * its error the process goes down over a lost line. It would also mean a
   * test capturing host output had to complete the write it captured, and the
   * ordinary way to capture it does not.
   */
  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: (error?: Error) => void,
  ): void {
    this.#sink.write(chunk.toString("utf8"));
    this.hostStream().write(chunk);
    done();
  }
}
