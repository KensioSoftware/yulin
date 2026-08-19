import { AsyncLocalStorage } from "node:async_hooks";
import { StringDecoder } from "node:string_decoder";
import { format } from "node:util";

import type { SimLambdaOutputSink } from "../logging/sim-lambda-output-sink.js";

/**
 * The console methods an invocation's output is taken from.
 *
 * These are the ones that format their arguments the way `console.log` does,
 * so what is recorded is what the host console prints. `console.trace` and
 * `console.dir` decorate their output, and recording a plain format of their
 * arguments would put something in the log group that the handler never
 * printed. Both still reach the host console, and both are recorded when the
 * host console goes on to write them to `process.stdout`.
 */
const CONSOLE_METHODS = ["log", "info", "debug", "warn", "error"] as const;

type ConsoleMethod = (typeof CONSOLE_METHODS)[number];

type StreamChunk = string | Uint8Array;

/**
 * One of the process's standard streams, as much of it as recording needs.
 */
export interface SimLambdaProcessStream {
  write: (chunk: StreamChunk, ...rest: never[]) => boolean;
}

/**
 * The process console, as much of it as recording needs.
 */
export type SimLambdaProcessConsole = Record<
  ConsoleMethod,
  (...arguments_: readonly unknown[]) => void
>;

/**
 * What an invocation of host-scope code prints through.
 */
export interface SimLambdaProcessGlobals {
  readonly console: SimLambdaProcessConsole;
  readonly stdout: SimLambdaProcessStream;
  readonly stderr: SimLambdaProcessStream;
}

/**
 * The real process globals, read when the patch is installed.
 */
function hostProcessGlobals(): SimLambdaProcessGlobals {
  return {
    console: globalThis.console,
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

/**
 * What a sim Lambda handler running in the host scope prints.
 *
 * A handler backed by a real in-process function is a closure over its own
 * module scope, so it prints through the host process's console and streams
 * like any other code in the test run. Zip code has a vm sandbox with streams
 * of its own and needs none of this. Node.js asynchronous context tracking
 * bridges the gap for the in-process case, exactly as it does for the clock
 * and for process.env: the invocation's sink is held in an AsyncLocalStorage
 * store, and a write resolves to it while it is set.
 *
 * The store follows the invocation across await points, so concurrent
 * invocations each record to their own function's log group, and output from
 * the rest of the test run reaches the host console alone.
 *
 * Both the console and the standard streams are patched, because a test runner
 * commonly replaces the global console with one of its own that writes
 * somewhere else. Vitest does, which means a patch on `process.stdout` alone
 * would see a handler's direct writes and miss every `console.log` it made.
 * The console patch delegates outside the store, so a line the host console
 * passes on to `process.stdout` is recorded once.
 *
 * The process globals are taken from a function so that a test can build an
 * instance over streams it can watch. Everything else shares the one below.
 */
export class SimLambdaProcessOutput {
  private readonly storage = new AsyncLocalStorage<SimLambdaOutputSink>();
  private installed = false;

  constructor(
    private readonly processGlobals: () => SimLambdaProcessGlobals = hostProcessGlobals,
  ) {}

  /**
   * Run an invocation with the given sink recording what it prints.
   */
  async run<T>(sink: SimLambdaOutputSink, run: () => Promise<T>): Promise<T> {
    this.install();

    return await this.storage.run(sink, run);
  }

  /**
   * Tee the process console and standard streams into the invocation store.
   *
   * Installed on the first invocation that has somewhere to record rather than
   * at import, so a test run that only ever invokes zip code, or that builds a
   * function standalone outside a SimAws instance, is left completely alone.
   *
   * With no invocation running, both patches forward and record nothing, so an
   * installed patch behaves exactly like no patch at all. Neither is ever
   * removed: removing one would be unsafe while another invocation is in
   * flight, and there is nothing to gain.
   */
  private install(): void {
    if (this.installed) {
      return;
    }

    this.installed = true;

    const globals = this.processGlobals();

    this.patchConsole(globals.console);
    this.patchStream(globals.stdout);
    this.patchStream(globals.stderr);
  }

  /**
   * Record what the console prints during an invocation.
   *
   * The host method is held from install time. A test runner that wraps the
   * console afterwards wraps the patch, so its own interception still sees
   * every write, and one that replaces the console object outright takes the
   * patch with it and gets the output the handler wrote.
   */
  private patchConsole(hostConsole: SimLambdaProcessConsole): void {
    for (const method of CONSOLE_METHODS) {
      // oxlint-disable-next-line security/detect-object-injection -- one of this module's own fixed method names.
      const hostMethod = hostConsole[method].bind(hostConsole);

      // oxlint-disable-next-line security/detect-object-injection -- one of this module's own fixed method names.
      hostConsole[method] = (...arguments_: readonly unknown[]): void => {
        this.storage.getStore()?.write(`${format(...arguments_)}\n`);

        // Delegated outside the store, because the host console writing to
        // process.stdout would otherwise record the same line a second time.
        this.storage.exit(() => {
          hostMethod(...arguments_);
        });
      };
    }
  }

  /**
   * Record what is written to one of the process's standard streams.
   *
   * Chunks are decoded as one stream rather than one at a time. A handler
   * writing bytes in pieces can split a multibyte character across two writes,
   * and decoding each chunk on its own would record a replacement character in
   * place of both halves.
   */
  private patchStream(hostStream: SimLambdaProcessStream): void {
    const hostWrite = hostStream.write.bind(hostStream);
    const decoder = new StringDecoder("utf8");

    hostStream.write = (chunk: StreamChunk, ...rest: never[]): boolean => {
      const sink = this.storage.getStore();

      if (sink !== undefined) {
        sink.write(
          typeof chunk === "string" ? chunk : decoder.write(Buffer.from(chunk)),
        );
      }

      return hostWrite(chunk, ...rest);
    };
  }
}

/**
 * Shared because it patches process globals: one patch, one store.
 */
export const simLambdaProcessOutput = new SimLambdaProcessOutput();
