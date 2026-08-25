import { SimAthenaOutputLocation } from "../../execution/sim-athena-output-location.js";
import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import type { SimAthenaWorkGroup } from "../../workgroup/sim-athena-work-group.js";
import type { SimAthenaResultConfigurationInput } from "../work-group/work-group.command.js";

/**
 * Where one query's results go.
 *
 * A workgroup with `EnforceWorkGroupConfiguration` set wins whatever the
 * request asked for, which is the whole point of the flag: a stack setting a
 * results Bucket wants every query in the workgroup to land there. A workgroup
 * without it lets a request name its own location and falls back to the
 * workgroup's.
 *
 * A query with neither is refused. Athena has nowhere to put the results, and
 * running it would leave the caller with a `SUCCEEDED` execution naming an
 * object that was never written.
 */
export function queryOutputLocation(
  workGroup: SimAthenaWorkGroup,
  requested: SimAthenaResultConfigurationInput | undefined,
): string {
  const location = workGroup.enforcesConfiguration
    ? workGroup.outputLocation
    : (requested?.OutputLocation ?? workGroup.outputLocation);

  if (location === undefined || location === "") {
    throw new SimAthenaInvalidRequestException(
      `No output location provided. Set ResultConfiguration.OutputLocation ` +
        `on the request, or on workgroup ${workGroup.name}.`,
    );
  }

  // Refuses a location that is not an S3 URI before the query is queued.
  new SimAthenaOutputLocation(location);

  return location;
}
