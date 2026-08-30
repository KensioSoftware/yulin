/**
 * The real AWS::Logs::MetricFilter properties this simulation records rather
 * than acts on, and why each one is left alone.
 */
export const unsimulatedPropertyReasons = new Map<string, string>([
  [
    "ApplyOnTransformedLogs",
    "log transformers are absent, so there is no transformed version of an " +
      "event for a filter to read and every filter here matches what was " +
      "written",
  ],
  [
    "EmitSystemFieldDimensions",
    "the system fields a log event carries in an account are absent here, so " +
      "there is nothing to emit them from",
  ],
]);
