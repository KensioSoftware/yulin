/**
 * Records the names code reads from the host process.env.
 *
 * SimLambdaEnvironmentConflicts warns that a module-scope read sees the host
 * value of a variable instead of the function's own. Whether that matters
 * depends on a read having happened at all, which configuration cannot tell.
 * This keeps the evidence: the host environment is handed out behind a Proxy
 * that notes each name read through it.
 *
 * Enumerating the whole environment is not counted as reading every name in
 * it. Node.js copies process.env key by key when it spawns a child process,
 * and so does any tool that snapshots it, and none of that is handler code
 * capturing a value it later depends on. An enumeration is recognised by its
 * shape: the property reads that follow a listing of the keys, in the order
 * the listing gave them. Its reads are recorded as they happen and taken off
 * the record again once every key has been read, so a listing that is not
 * followed by a complete copy hides nothing. A module copying the environment
 * with a spread at module scope is missed as a result.
 */
export class SimProcessEnvironmentReads {
  private readonly names = new Set<string>();

  /**
   * The environment objects each watching Proxy stands in front of, so that
   * assigning one back to process.env does not stack a Proxy on a Proxy.
   */
  private readonly targets = new WeakMap<object, NodeJS.ProcessEnv>();

  /**
   * The keys of an enumeration in progress, and how far its reads have got.
   */
  private enumeration:
    | {
        readonly keys: readonly (string | symbol)[];
        next: number;
        /**
         * The names the enumeration's reads put on record for the first time.
         */
        readonly added: string[];
      }
    | undefined;

  /**
   * Whether code has read the name through a watched environment.
   */
  wasRead(name: string): boolean {
    return this.names.has(name);
  }

  /**
   * A view of the environment that records the names read through it.
   *
   * Writes and deletes go straight to the environment, so a value assigned
   * through the view is coerced to a string as process.env would coerce it.
   */
  watch(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const target = this.unwrap(environment);
    const view = new Proxy(target, {
      get: (watched, key): unknown => {
        if (typeof key === "string") {
          this.recordRead(key);
        }
        return Reflect.get(watched, key);
      },
      set: (watched, key, value): boolean => Reflect.set(watched, key, value),
      ownKeys: (watched): (string | symbol)[] => {
        const keys = Reflect.ownKeys(watched);
        this.enumeration = { keys, next: 0, added: [] };
        return keys;
      },
    });
    this.targets.set(view, target);
    return view;
  }

  /**
   * The environment behind a watching view, or the environment itself when it
   * is not one.
   */
  unwrap(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return this.targets.get(environment) ?? environment;
  }

  /**
   * Note a read, and take an enumeration's reads off the record once it has
   * read every key.
   */
  private recordRead(name: string): void {
    const enumeration = this.enumeration;
    if (
      enumeration === undefined ||
      enumeration.keys[enumeration.next] !== name
    ) {
      this.enumeration = undefined;
      this.names.add(name);
      return;
    }

    enumeration.next += 1;
    if (!this.names.has(name)) {
      this.names.add(name);
      enumeration.added.push(name);
    }
    if (enumeration.next < enumeration.keys.length) {
      return;
    }

    for (const added of enumeration.added) {
      this.names.delete(added);
    }
    this.enumeration = undefined;
  }
}
