/**
 * The throttling half of one route's settings, which is what a stage's
 * `DefaultRouteSettings` and each entry of its `RouteSettings` carry.
 *
 * `ThrottlingRateLimit` is requests per second and `ThrottlingBurstLimit` is
 * how many requests the route may take at once. The members that say nothing
 * about throttling are not simulated. They are left out of this type too.
 */
export interface SimHttpApiRouteSettings {
  readonly ThrottlingRateLimit?: number | undefined;
  readonly ThrottlingBurstLimit?: number | undefined;
}

/**
 * A stage's `RouteSettings`, keyed by the route key each entry applies to.
 */
export type SimHttpApiRouteSettingsMap = Readonly<
  Record<string, SimHttpApiRouteSettings>
>;

/**
 * What a stage reports of the route settings it was created with.
 */
export interface SimHttpApiRouteSettingsView {
  DefaultRouteSettings?: SimHttpApiRouteSettings;
  RouteSettings?: SimHttpApiRouteSettingsMap;
}
