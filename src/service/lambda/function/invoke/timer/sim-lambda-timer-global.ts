/**
 * Put a substitute in a global timer function's place, keeping everything else
 * about it.
 *
 * The property stays the configurable, writable, non-enumerable global it
 * already was, so anything else replacing it later finds what it expects. The
 * host function's own symbols come across too: `setTimeout` carries the one
 * that makes `util.promisify` answer with the promise form, and code reaching
 * for that would otherwise get a promise of the handle instead.
 */
export function defineSimLambdaTimer(name: string, substitute: object): void {
  const host = Reflect.get(globalThis, name) as object;

  for (const symbol of Object.getOwnPropertySymbols(host)) {
    Object.defineProperty(substitute, symbol, {
      configurable: true,
      value: Reflect.get(host, symbol),
    });
  }

  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: substitute,
  });
}
