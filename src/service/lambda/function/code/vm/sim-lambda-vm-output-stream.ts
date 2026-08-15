import { Writable } from "node:stream";

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
 * What function code writes is forwarded to the host stream, which is where a
 * handler's own console output already goes, so the two end up in the same
 * place instead of one of them disappearing. The host stream is read per
 * write, so a test that starts capturing host output after the function has
 * cold-started still sees what the handler writes.
 */
export class SimLambdaVmOutputStream extends Writable {
  constructor(private readonly hostStream: () => NodeJS.WritableStream) {
    super();
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: (error?: Error) => void,
  ): void {
    this.hostStream().write(chunk);
    done();
  }
}
