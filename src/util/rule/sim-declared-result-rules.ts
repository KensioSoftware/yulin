/**
 * The keys one request is matched on, in the order the tiers are tried.
 *
 * A request carrying nothing for a tier skips it. That is the ordinary case
 * rather than an edge: a Rekognition image passed as bytes has no S3 object
 * name, and a Personalize related-items request names no user.
 */
export interface SimDeclaredResultKeys {
  readonly leading?: string | undefined;
  readonly trailing?: string | undefined;
}

/**
 * The results a simulated operation answers with, by the keys a request
 * carries.
 *
 * A service that answers from declarations rather than from data needs the
 * same matcher each time. A request carries one or two identifying keys, a
 * test declares what each of them answers with, and everything else gets the
 * default. Simulated Rekognition matches an image by content hash and then by
 * S3 object name; simulated Personalize matches a recommendation request by
 * item and then by user.
 *
 * There are three kinds of rule and one order between them: a leading key rule
 * wins, then a trailing key rule, then the default. Matching is exact, with no
 * pattern syntax, so which rule applies never depends on how specific a
 * pattern is thought to be.
 *
 * The keys are matched, not validated. What counts as a key at all belongs to
 * the service declaring the rule, which is where a malformed one is refused.
 */
export class SimDeclaredResultRules<TResult> {
  private defaultResult: TResult;
  private readonly byLeadingKey = new Map<string, TResult>();
  private readonly byTrailingKey = new Map<string, TResult>();

  constructor(defaultResult: TResult) {
    this.defaultResult = defaultResult;
  }

  /**
   * Answer with this result for any request no other rule matches.
   */
  byDefault(result: TResult): void {
    this.defaultResult = result;
  }

  /**
   * Answer with this result for a request carrying this exact leading key.
   */
  onLeadingKey(key: string, result: TResult): void {
    this.byLeadingKey.set(key, result);
  }

  /**
   * Answer with this result for a request carrying this exact trailing key,
   * where no leading key rule matched it first.
   */
  onTrailingKey(key: string, result: TResult): void {
    this.byTrailingKey.set(key, result);
  }

  /**
   * The result for one request.
   */
  resultFor(keys: SimDeclaredResultKeys): TResult {
    return this.declaredFor(keys) ?? this.defaultResult;
  }

  /**
   * The result a rule declared for one request, where a rule matched it.
   *
   * The default is left out, so a caller can tell a request nobody wrote a
   * rule for from one that matched. A service chaining declarations with
   * something that computes an answer needs that distinction, and simulated
   * Athena runs its query engine on the miss.
   *
   * A request carrying only the key of the tier it is asking about answers
   * from that tier alone.
   */
  declaredFor(keys: SimDeclaredResultKeys): TResult | undefined {
    return (
      this.matched(this.byLeadingKey, keys.leading) ??
      this.matched(this.byTrailingKey, keys.trailing)
    );
  }

  private matched(
    rules: ReadonlyMap<string, TResult>,
    key: string | undefined,
  ): TResult | undefined {
    if (key === undefined) {
      return undefined;
    }

    return rules.get(key);
  }
}
