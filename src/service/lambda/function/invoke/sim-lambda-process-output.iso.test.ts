import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimLambdaOutputSink } from "../logging/sim-lambda-output-sink.js";
import {
  SimLambdaProcessOutput,
  type SimLambdaProcessGlobals,
  type SimLambdaProcessStream,
} from "./sim-lambda-process-output.js";

/**
 * Somewhere to record, standing in for the log writer a function invocation
 * brings with it.
 */
class RecordingSink implements SimLambdaOutputSink {
  readonly recorded: string[] = [];

  write(chunk: string): void {
    this.recorded.push(chunk);
  }
}

/**
 * A standard stream that keeps what was written to it.
 */
class WatchedStream implements SimLambdaProcessStream {
  readonly written: string[] = [];

  write = (chunk: string | Uint8Array): boolean => {
    this.written.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
    );

    return true;
  };
}

/**
 * Process globals a test can watch, with a console that prints to the given
 * standard output the way the host console does.
 */
function watchedGlobals(): {
  globals: SimLambdaProcessGlobals;
  stdout: WatchedStream;
  stderr: WatchedStream;
} {
  const stdout = new WatchedStream();
  const stderr = new WatchedStream();
  const print = (...arguments_: readonly unknown[]): void => {
    stdout.write(`${arguments_.join(" ")}\n`);
  };

  return {
    globals: {
      console: {
        log: print,
        info: print,
        debug: print,
        warn: print,
        error: print,
      },
      stdout,
      stderr,
    },
    stdout,
    stderr,
  };
}

/**
 * Resolve after a real pause, so a test can interleave two runs and prove they
 * do not record into each other's sink.
 */
async function tick(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe("sim Lambda process output", () => {
  it("records what the run printed through the console", async () => {
    // Given process globals a test can watch.
    const { globals, stdout } = watchedGlobals();
    const output = new SimLambdaProcessOutput(() => globals);
    const sink = new RecordingSink();

    // When a run prints.
    await output.run(sink, async () => {
      globals.console.log("INFO handling order-1");
      await Promise.resolve();
    });

    // Then the line was recorded, and it still reached the host console.
    assertArrayEquals(sink.recorded, ["INFO handling order-1\n"]);
    assertArrayEquals(stdout.written, ["INFO handling order-1\n"]);
  });

  it("records a printed line once, where the console prints to the stream", async () => {
    // Given a console that writes to standard output, as the host one does.
    const { globals } = watchedGlobals();
    const output = new SimLambdaProcessOutput(() => globals);
    const sink = new RecordingSink();

    // When a run prints one line through it.
    await output.run(sink, async () => {
      globals.console.error("ERROR order has no items");
      await Promise.resolve();
    });

    // Then the line was recorded once: the console patch hands on outside the
    // store, so the write it causes finds nothing recording.
    assertArrayEquals(sink.recorded, ["ERROR order has no items\n"]);
  });

  it("records what the run wrote to a standard stream", async () => {
    // Given process globals a test can watch.
    const { globals, stderr } = watchedGlobals();
    const output = new SimLambdaProcessOutput(() => globals);
    const sink = new RecordingSink();

    // When a run writes to a stream itself.
    await output.run(sink, async () => {
      globals.stdout.write("no newline");
      globals.stderr.write(Buffer.from("bytes\n"));
      await Promise.resolve();
    });

    // Then both writes were recorded, and both still reached the host stream.
    assertArrayEquals(sink.recorded, ["no newline", "bytes\n"]);
    assertArrayEquals(stderr.written, ["bytes\n"]);
  });

  it("records a character split across two writes whole", async () => {
    // Given a multibyte character written in two halves, as code writing
    // bytes it read in pieces does.
    const { globals } = watchedGlobals();
    const output = new SimLambdaProcessOutput(() => globals);
    const sink = new RecordingSink();
    const bytes = Buffer.from("玉\n");

    // When a run writes it a byte at a time.
    await output.run(sink, async () => {
      globals.stdout.write(bytes.subarray(0, 1));
      globals.stdout.write(bytes.subarray(1));
      await Promise.resolve();
    });

    // Then what was recorded holds the character rather than two replacements.
    assertIdentical(sink.recorded.join(""), "玉\n");
  });

  it("leaves output made outside a run alone", async () => {
    // Given a run that has installed the patches.
    const { globals, stdout } = watchedGlobals();
    const output = new SimLambdaProcessOutput(() => globals);
    const sink = new RecordingSink();

    await output.run(sink, () => Promise.resolve());

    // When the rest of the test run prints.
    globals.console.log("a line from the test");
    globals.stdout.write("another\n");

    // Then nothing was recorded, and both reached the host console.
    assertArrayEquals(sink.recorded, []);
    assertArrayEquals(stdout.written, ["a line from the test\n", "another\n"]);
  });

  it("keeps two concurrent runs apart", async () => {
    // Given two runs interleaved over their own sinks.
    const { globals } = watchedGlobals();
    const output = new SimLambdaProcessOutput(() => globals);
    const orders = new RecordingSink();
    const invoices = new RecordingSink();

    // When both print on either side of a pause.
    await Promise.all([
      output.run(orders, async () => {
        globals.console.log("order-1");
        await tick(20);
        globals.console.log("order-2");
      }),
      output.run(invoices, async () => {
        await tick(10);
        globals.console.log("invoice-1");
      }),
    ]);

    // Then each sink holds only what its own run printed.
    assertArrayEquals(orders.recorded, ["order-1\n", "order-2\n"]);
    assertArrayEquals(invoices.recorded, ["invoice-1\n"]);
  });
});
