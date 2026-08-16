/**
 * The AWS::Logs::LogGroup properties this simulation has nothing to act on,
 * and why.
 *
 * They are recorded as ignored rather than refused, because a log group
 * without any of them still does the one thing a log group does here: hold the
 * events written to it, under a name and with a retention a test can assert
 * on. Refusing would take a whole stack down over a property that changes
 * nothing about what the test is checking.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "KmsKeyId",
    "log group encryption is not simulated, so events are held in this " +
      "process either way and no key is ever used",
  ],
  [
    "DataProtectionPolicy",
    "data protection is not simulated, so nothing masks or audits a value an " +
      "event carries",
  ],
  [
    "FieldIndexPolicies",
    "field indexes only change how Logs Insights queries are served, and " +
      "there are no Logs Insights queries here",
  ],
  [
    "Tags",
    "log group tags are not simulated, so nothing reads them back and " +
      "nothing is billed or grouped by them",
  ],
  [
    "LogGroupClass",
    "only the standard class is simulated, which is what every operation " +
      "here behaves as",
  ],
]);
