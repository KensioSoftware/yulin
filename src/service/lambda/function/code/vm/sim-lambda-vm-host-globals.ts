/**
 * The globals the Node.js runtime provides that the sandbox passes through
 * from the host as they are.
 *
 * Anything here is the host's own object, so what function code builds with
 * one and what the simulation answers with are the same kind of thing. The
 * globals the sandbox replaces (the console, `process`, `Date`, the timers
 * and `fetch`) are built in `makeSimLambdaVmContext` instead.
 */
const simLambdaVmHostGlobalNames = [
  "Buffer",
  "setImmediate",
  // The host's, since the sandbox's `setImmediate` is the host's too.
  "clearImmediate",
  "queueMicrotask",
  "structuredClone",
  "atob",
  "btoa",
  "TextEncoder",
  "TextDecoder",
  "URL",
  "URLSearchParams",
  "URLPattern",
  "DOMException",

  // The Fetch API types. The client itself is the sandbox's own.
  "Headers",
  "Request",
  "Response",
  "FormData",
  "Blob",
  "File",
  "AbortController",
  "AbortSignal",

  // WHATWG streams, which bundled SDK clients build their event streams on.
  "ReadableStream",
  "ReadableStreamDefaultReader",
  "ReadableStreamBYOBReader",
  "ReadableStreamBYOBRequest",
  "ReadableByteStreamController",
  "ReadableStreamDefaultController",
  "WritableStream",
  "WritableStreamDefaultController",
  "WritableStreamDefaultWriter",
  "TransformStream",
  "TransformStreamDefaultController",
  "ByteLengthQueuingStrategy",
  "CountQueuingStrategy",
  "TextEncoderStream",
  "TextDecoderStream",
  "CompressionStream",
  "DecompressionStream",

  // Events and messaging.
  "Event",
  "EventTarget",
  "CustomEvent",
  "MessageEvent",
  "CloseEvent",
  "MessageChannel",
  "MessagePort",
  "BroadcastChannel",
  "WebSocket",

  // Web Crypto.
  "crypto",
  "Crypto",
  "CryptoKey",
  "SubtleCrypto",

  // Performance reads host time, while `Date` reads the simulated clock.
  "performance",
  "Performance",
  "PerformanceEntry",
  "PerformanceMark",
  "PerformanceMeasure",
  "PerformanceObserver",
  "PerformanceObserverEntryList",
  "PerformanceResourceTiming",

  "navigator",
  "Navigator",
] as const;

/**
 * The host's own value for each global the sandbox passes through.
 */
export function simLambdaVmHostGlobals(): Record<string, unknown> {
  return Object.fromEntries(
    simLambdaVmHostGlobalNames.map((name) => [
      name,
      Reflect.get(globalThis, name),
    ]),
  );
}
