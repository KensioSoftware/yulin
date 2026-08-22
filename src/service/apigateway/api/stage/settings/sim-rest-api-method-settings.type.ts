/**
 * The throttling half of one method's settings, as an entry of a stage's
 * `methodSettings` carries it.
 *
 * `throttlingRateLimit` is requests per second and `throttlingBurstLimit` is
 * how many requests the method may take at once. The members that say nothing
 * about throttling are not simulated. They are left out of this type too.
 */
export interface SimRestApiMethodSettings {
  readonly throttlingRateLimit?: number | undefined;
  readonly throttlingBurstLimit?: number | undefined;
}

/**
 * A stage's `methodSettings`, keyed `{resourcePath}/{httpMethod}`, which is
 * how real API Gateway keys them. A resource path of `/` followed by a star,
 * with a star for the method, is the stage default.
 */
export type SimRestApiMethodSettingsMap = Readonly<
  Record<string, SimRestApiMethodSettings>
>;
