# Simulated CloudWatch metrics implementation

This directory contains the simulated CloudWatch metrics implementation: custom metrics, the
datapoints published to them, and the statistics read back over periods.

The guiding decision is that a metric's identity is its namespace, its name and its exact dimension
set together. Real CloudWatch does not roll a custom metric up across dimensions, and following that
is what makes a test here worth writing: a query naming no dimensions reaches the metric published
with none, not the total of every channel, which is exactly the mistake teams make on a dashboard.

Alarms are not here. They are follow-on work, and they will need something this service does not
have yet: a schedule on the simulation's clock.

## Entry points

- `sim-cloudwatch.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public CloudWatch simulator API for `@kensio/yulin/cloudwatch`.

A `SimCloudWatch` owns a `SimCloudWatchMetricStore` holding its metrics. The simulator is scoped to
an account and region because real metrics are: a metric published in one region is invisible from
another, and there is no ARN by which to reach one across the boundary.

`SimCloudWatchCommands` holds the wiring, as `SimLogsCommands` does for CloudWatch Logs, so the
facade can stay one method per SDK Command.

## The datapoint model

Everything under `metric/` turns on one decision in `sim-cloudwatch-datapoint.ts`: a stored
datapoint is a count, a total and the two extremes, never a list of values.

That is not a shortcut. A `StatisticValues` datum summarises many observations and never carries the
values behind them, so there is nothing to store individually even if we wanted to. The three input
forms, `Value`, `StatisticValues` and `Values`/`Counts`, all reduce to the same shape in
`command/data/sim-cloudwatch-metric-datum.ts`, and nothing downstream has to know which one was
used.

It also settles what cannot be answered. Percentiles need the individual values, so real CloudWatch
cannot report one for a metric published as a statistic set either. Rather than answer for some
metrics and not others, `ExtendedStatistics` is refused.

## Periods

`sim-cloudwatch-period.ts` floors a timestamp to a multiple of the period measured from the epoch,
rather than from the request's start time, so the same observation lands in the same bucket whatever
window is asked for. That matches real CloudWatch for every period dividing an hour, which is every
period a test is likely to ask for.

A window includes its start and excludes its end, which is how real CloudWatch reads the two.

## Authorization

`command/authorize/sim-cloudwatch-authorizer.ts` authorizes every action against `*`, because
CloudWatch metrics have no ARN. This is the one service here where a policy naming a resource is
always wrong, and the authorizer is deliberately shaped so that it cannot accidentally start
accepting one.

`PutMetricData` additionally supplies the namespace to IAM as `cloudwatch:namespace`, which is the
only way a policy can narrow publishing, and the way AWS's own documented policies do it.

## Refusing rather than ignoring

Several inputs real CloudWatch accepts are refused here: metric math expressions, extended
statistics, high-resolution storage, `MaxDatapoints`, and cross-account listing. Each throws
`SimCloudWatchInvalidParameterValueException` with a message saying it is not simulated, which
follows the same call simulated SSM makes for its unsimulated `PutParameter` options.

The reason is the same each time. A dropped `MaxDatapoints` would hand back values at a resolution
real AWS would have widened, and `SUM(errors)/SUM(calls)` quietly answered as `SUM(errors)` would
make a test pass on a number nobody asked for.

`SimCloudWatchInvalidParameterValueException` doing double duty, for both real refusals and
unsimulated input, is deliberate: CloudWatch has no `UnsupportedOperationException` of its own, and
inventing an error name the SDK has never seen would be a worse divergence than reusing this one.
