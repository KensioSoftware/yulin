import { Writable } from "node:stream";

/**
 * The content type `HttpResponseStream.from` gives a response stream, which
 * tells a Function URL the stream opens on a prelude of its own.
 */
export const simLambdaHttpIntegrationContentType =
  "application/vnd.awslambda.http-integration-response";

/**
 * The response stream real Lambda hands a handler wrapped in
 * `awslambda.streamifyResponse`, in place of the context it would get second.
 *
 * It is a Node.js `Writable`, so `pipeline` and `write`/`end` work on it as
 * they do on the real one. What has been written is held for a buffered
 * Invoke to answer with, and handed on as it is written to whoever asked to
 * follow it. A Function URL in `RESPONSE_STREAM` mode follows it.
 */
export class SimLambdaResponseStream extends Writable {
  /** The content type the stream's bytes are sent as. */
  contentType = "application/octet-stream";

  readonly #chunks: Buffer[] = [];
  #beforeFirstWrite: ((write: (chunk: Buffer) => void) => void) | undefined;

  /**
   * Set the content type, before anything is written, as on the real stream.
   */
  setContentType(contentType: string): void {
    this.contentType = contentType;
  }

  /**
   * Write something ahead of the first chunk, which is how
   * `HttpResponseStream.from` puts its prelude in front of the body.
   * @internal
   */
  onBeforeFirstWrite(write: (write: (chunk: Buffer) => void) => void): void {
    this.#beforeFirstWrite = write;
  }

  /** Everything written so far. */
  bytes(): Buffer {
    return Buffer.concat(this.#chunks);
  }

  override _write(
    chunk: unknown,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.#writeFirst();
    // A copy, since the writer may reuse its buffer once the write completes.
    this.#record(
      Buffer.isBuffer(chunk)
        ? Buffer.from(chunk)
        : Buffer.from(chunk as string, encoding),
    );
    callback();
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.#writeFirst();
    callback();
  }

  #writeFirst(): void {
    const beforeFirstWrite = this.#beforeFirstWrite;
    this.#beforeFirstWrite = undefined;
    beforeFirstWrite?.((chunk) => {
      this.#record(chunk);
    });
  }

  #record(chunk: Buffer): void {
    this.#chunks.push(chunk);
    this.emit("chunk", chunk);
  }
}

/**
 * What a streaming handler answered with, once its stream has ended.
 */
export class SimLambdaStreamedResponse {
  readonly stream: SimLambdaResponseStream;

  constructor(stream: SimLambdaResponseStream) {
    this.stream = stream;
  }
}
