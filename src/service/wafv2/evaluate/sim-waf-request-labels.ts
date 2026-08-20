/**
 * The labels one request has picked up as a web ACL evaluates it.
 *
 * A rule adds its labels when it matches, and the rules that run after it can
 * match on them, so the labels belong to the request being evaluated rather
 * than to the web ACL. That is what makes the tuning pattern work: a managed
 * rule group runs in count mode and labels the request, and a rule of the
 * reader's own blocks on the label.
 */
export class SimWafRequestLabels {
  readonly #added = new Set<string>();

  /**
   * Add a label, by its fully qualified name.
   */
  add(label: string): void {
    this.#added.add(label);
  }

  /**
   * Whether this exact label was added.
   */
  has(label: string): boolean {
    return this.#added.has(label);
  }

  /**
   * Whether any label within a namespace was added.
   *
   * A namespace is the label name up to and including a colon, so a key
   * written without the trailing colon is read as if it had one. Without that,
   * `awswaf:managed:aws:core-rule-set` would also match a label from a group
   * whose name merely started with `core-rule-set`.
   */
  hasNamespace(namespace: string): boolean {
    const prefix = namespace.endsWith(":") ? namespace : `${namespace}:`;

    return this.#added.values().some((label) => label.startsWith(prefix));
  }

  /**
   * Every label added, in the order the rules that added them ran.
   */
  all(): readonly string[] {
    return [...this.#added];
  }
}
