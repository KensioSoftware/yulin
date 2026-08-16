/**
 * Something that records what a Lambda handler writes to its standard streams.
 *
 * Executable code is given one of these before it cold starts, so the streams
 * it hands function code tee into it. It is an interface rather than the log
 * writer itself so that the code path does not have to know that what it is
 * writing to is a log group.
 */
export interface SimLambdaOutputSink {
  /**
   * Record a chunk of output, which need not be a whole line.
   */
  write(chunk: string): void;
}

/**
 * A sink that records nothing.
 *
 * Code that was never given one writes to the host streams and nowhere else,
 * which is what a function built standalone, outside a SimAws instance, does.
 */
export const simLambdaNoOutputSink: SimLambdaOutputSink = {
  write: (): void => {
    // Nothing is recording.
  },
};
