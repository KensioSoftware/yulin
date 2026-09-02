# Parquet in the Athena query engine (spike for #1253)

Throwaway. `src/` is patched here to make the measurements, and the branch is meant to be deleted once the follow-up issues are filed.

This repository has no reader dependency. Add one before running any of this.

```bash
pnpm add -D hyparquet hyparquet-writer
```

The fixtures are Parquet files this repository did not write. Fetch them first.

```bash
mkdir -p pq && for f in alltypes_plain.parquet alltypes_plain.snappy.parquet datapage_v2.snappy.parquet delta_byte_array.parquet int32_decimal.parquet nested_lists.snappy.parquet; do curl -sSL -o "pq/$f" "https://raw.githubusercontent.com/apache/parquet-testing/master/data/$f"; done
curl -sSL -o pq/yellow_tripdata_2024-01.parquet https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet
```

Then run `pnpm tsx spike/parquet/probe.ts pq`, `end-to-end.ts pq`, `divergence.ts`, `refusals.ts`, `scanned.ts`, `types.ts` and `dependency.ts`.

## The answer

Parquet works, and it costs less than the SQL engine did. The whole change is **45 lines across four existing files plus a 52-line reader**, and the dependency is **0.5MB with no dependencies of its own** against `node-sql-parser`'s 88.4MB.

The scepticism was reasonable and the measurement went the other way.

## What ran

`end-to-end.ts` deploys a Glue database and two tables from a CloudFormation template, seeds Parquet objects into simulated S3 under two Hive style partition prefixes, turns the engine on and answers three queries through the real `StartQueryExecution` lifecycle. All three report `answeredBy` as `engine`.

```
SELECT url, count(*) AS hits, sum(bytes) AS total, avg(latency) AS mean
FROM rainlytics.access_logs
WHERE status >= 400 AND day = '2026-08-01'
GROUP BY 1 ORDER BY hits DESC
  state       SUCCEEDED
  answeredBy  engine
  scanned     1179 bytes
  | url | hits | total | mean
  | /pricing | 2 | 615 | 39.875
```

The third query reads `delta_byte_array.parquet` from `apache/parquet-testing`, written by parquet-mr 1.10.0 and produced outside this repository.

```
SELECT c_birth_country, count(*) AS people FROM rainlytics.customers
WHERE c_preferred_cust_flag = 'Y' GROUP BY 1 ORDER BY people DESC, 1 ASC LIMIT 5
  answeredBy  engine
  | BAHRAIN | 9
  | GUYANA | 7
```

## The files it reads

`probe.ts` reads seven Parquet files written by four different writers. Every one of them reads.

| File                              | Writer                   | Codec        | Encodings                                       | Result                         |
| --------------------------------- | ------------------------ | ------------ | ----------------------------------------------- | ------------------------------ |
| `alltypes_plain.parquet`          | impala 1.3.0             | UNCOMPRESSED | RLE, PLAIN_DICTIONARY, PLAIN                    | 8 rows                         |
| `alltypes_plain.snappy.parquet`   | impala 1.3.0             | SNAPPY       | RLE, PLAIN_DICTIONARY, PLAIN                    | 2 rows                         |
| `datapage_v2.snappy.parquet`      | parquet-mr 1.8.1         | SNAPPY       | PLAIN, RLE_DICTIONARY, DELTA_BINARY_PACKED, RLE | 5 rows                         |
| `delta_byte_array.parquet`        | parquet-mr 1.10.0        | UNCOMPRESSED | DELTA_BYTE_ARRAY                                | 1000 rows                      |
| `int32_decimal.parquet`           | parquet-mr 1.8.2         | UNCOMPRESSED | BIT_PACKED, RLE, PLAIN                          | 24 rows                        |
| `nested_lists.snappy.parquet`     | parquet-mr 1.8.2         | SNAPPY       | RLE, PLAIN_DICTIONARY, BIT_PACKED               | 3 rows, nested lists           |
| `yellow_tripdata_2024-01.parquet` | parquet-cpp-arrow 14.0.2 | ZSTD         | PLAIN, RLE, RLE_DICTIONARY                      | 2,964,624 rows in 3 row groups |

The last one is a 50MB production file from the NYC TLC public dataset, read whole.

**The gap in this evidence.** None of these came out of Athena `CTAS`. Athena engine v3 writes Parquet with Trino's writer, and Glue and EMR write it with parquet-mr, which three of the seven files cover. Getting a `CTAS` file needs an AWS account, and the spike ran without one. The residual risk is low and it is real.

## Compression

hyparquet decompresses `UNCOMPRESSED` and `SNAPPY` itself. Snappy is what Athena and Glue write by default. The common case needs nothing wired up.

`GZIP`, `ZSTD` and `BROTLI` reach a `compressors` callback the caller supplies, and `node:zlib` already has all three. Ten lines wire them up, verified against the ZSTD taxi file. `LZO`, `LZ4` and `LZ4_RAW` are what is left, and each would need a dependency. A file in one of those turns the query down cleanly.

This is the same position `sim-athena-object-codec.ts` already takes for text objects.

## The seam

`SimAthenaRecordReader` was `(text: string) => rows`. Parquet is binary and holds its own schema. The reader now takes `Uint8Array` and may return a promise. `simAthenaObjectText` became `simAthenaObjectBytes` and stops decoding. The JSON and delimited readers decode for themselves in one line each.

**All 393 existing Athena tests pass unchanged against the new seam.**

Key-extension decompression needed no change. A `.parquet` key names no codec in the map, and the bytes pass through untouched. That is the right answer, because Parquet compresses per column chunk inside itself. Athena `CTAS` writes extensionless keys and those pass through too.

## Types

`types.ts` writes one column of each type and reads it back.

| Parquet           | Arrives as    | Reaches SQLite as                                                   |
| ----------------- | ------------- | ------------------------------------------------------------------- |
| INT32             | `number`      | number                                                              |
| INT64             | `bigint`      | bigint, exact past 2^53                                             |
| DOUBLE, FLOAT     | `number`      | number                                                              |
| BOOLEAN           | `boolean`     | 1 and 0, read back by the Glue type                                 |
| BYTE_ARRAY (UTF8) | `string`      | text                                                                |
| TIMESTAMP, INT96  | `Date`        | **see below**                                                       |
| struct, list      | object, array | JSON text, which `json_extract_scalar` and `cardinality` reach into |

`simAthenaSqliteValue` already handled every one of these except `Date`. A Parquet timestamp reached SQLite as quoted JSON, and a filter on it answered zero rows while the query still succeeded. That is the quiet kind of wrong.

```
| at | on_day | amount
| "2026-08-01T10:00:00.000Z" | "2026-08-01T00:00:00.000Z" | 12.34
filter on a timestamp answers 0 (expected 1)
```

Six lines mapping `Date` onto the text a timestamp already reads as closes it.

```
| at | on_day | amount
| 2026-08-01 10:00:00 | 2026-08-01 00:00:00 | 12.34
filter on a timestamp answers 1 (expected 1)
```

One divergence is left standing there. A Glue `date` column renders `2026-08-01 00:00:00` where Athena renders `2026-08-01`. The Glue column type says which it is, the way it already decides booleans.

## Refusals

`refusals.ts` puts four objects under a Parquet table. Every failure falls through the `try` in `simAthenaEngineRun` and the declared result answers.

| Object                          | State     | Answered by |
| ------------------------------- | --------- | ----------- |
| A Parquet file it can read      | SUCCEEDED | engine      |
| JSON text under a Parquet table | SUCCEEDED | declaration |
| Parquet in LZ4_RAW              | SUCCEEDED | declaration |
| A truncated Parquet file        | SUCCEEDED | declaration |

No wrong answers and no crashes. The bottom three rows are the behaviour #1254 is about, each one falling back in silence.

## `DataScannedInBytes`

`scanned.ts` and `divergence.ts` measure it. The figure is the size of every object under the prefixes the query reaches. That was already true for text.

For Parquet that diverges from real Athena more sharply than it does for text, because skipping columns is the whole point of the format.

```
object                   42343 bytes, 20 columns
count(*)                 42343 bytes scanned
one column of twenty     42343 bytes scanned
```

Real Athena bills the second of those a fraction of the first. Two things put a better figure within reach. hyparquet takes a `columns` option and reads only those, and the per-column compressed byte sizes sit in the file footer where `parquetMetadata` already reads them. A correct answer needs neither, and both are follow-up work.

A partition predicate narrows the rows correctly and leaves the figure alone. That behaviour is the same for JSON and predates this spike.

## The dependency

`hyparquet` 1.29.2, MIT, **zero dependencies, 0.5MB installed**. It loads by dynamic `import("hyparquet")` under Node ESM, and a project without it throws the same shape `simAthenaSqlParser` already turns into a `SimAthenaSetUpError` naming what to add.

|                   | Version | Licence    | Installed | Dependencies |
| ----------------- | ------- | ---------- | --------- | ------------ |
| `hyparquet`       | 1.29.2  | MIT        | 0.5MB     | 0            |
| `node-sql-parser` | 5.4.0   | Apache-2.0 | 88.4MB    | 2            |

So it goes in the same way, as an optional peer dependency the docs tell a user to add. A project that never queries a Parquet table never installs it. The engine already needs turning on. The Parquet reader can then load on the first Parquet table it meets, which leaves a user querying JSON paying nothing either.

## Where a test gets a Parquet file

This is the part that limits the value, and it did not come up in #1253.

Reading Parquet helps someone who can put a Parquet object into simulated S3. Three ways exist and none of them is free.

- **A checked-in fixture file.** Works today with no extra package. It is also the least useful, because the file cannot vary with the test.
- **`hyparquet-writer`.** MIT, 0.4MB, one dependency (hyparquet). It wrote every fixture in this spike. It has gaps. A `DATE` column throws on the write, and that is how `types.ts` found out.
- **A simulated pipeline that produces Parquet.** Missing. `DataFormatConversionConfiguration` sits on Firehose's unsimulated list, and its refusal says Parquet and ORC conversion goes unsimulated, with every delivered Object holding the bytes that were put.

So a user whose production pipeline writes Parquet through Firehose still cannot test that pipeline end to end. They can test queries against Parquet they seed themselves.

## ORC

Refuse it, and keep refusing it.

`@npilots/norc` is the only ORC reader on npm, at version 0.3.0, **AGPL-3.0-or-later**, and it ships native C++ bindings. The licence rules it out for something Yulin's docs tell people to install, and the native build breaks the install story that makes hyparquet cheap. `orc-wasm`, `apache-orc` and `orc-js` are absent from npm. `norc` is a cron library.

ORC also matters less. Glue, Firehose and the AWS documentation all lead with Parquet.

## Cost

|                                                            | Lines      |
| ---------------------------------------------------------- | ---------- |
| `sim-athena-record-reader.ts` seam and Parquet SerDe names | 33 changed |
| `sim-athena-table-objects.ts` returns bytes                | 9 changed  |
| `sim-athena-table-rows.ts` await the reader                | 8 changed  |
| `sim-athena-sqlite-values.ts` the `Date` mapping           | 8 added    |
| `sim-athena-parquet-records.ts` the reader itself          | 52 new     |

45 lines changed across four files, one new file of 52 lines, and no change to the engine, the planner, the SQL translation or the result formatter.

## Recommendation

**Take it.** Parquet read support through `hyparquet` as an optional peer dependency, on the terms `node-sql-parser` already established.

The realism ceiling to document is that a Parquet table reads whole objects and reports every byte of them as scanned, that `SNAPPY`, `GZIP`, `ZSTD` and `BROTLI` read and `LZO`, `LZ4` and `LZ4_RAW` turn the query down, that a Parquet timestamp answers as a timestamp and a Parquet date answers as one too, and that ORC stays refused.

## Follow-ups

#1253 should be amended before it is picked up.

- The dependency is `hyparquet`, MIT, 0.5MB, loaded by dynamic import on the first Parquet table.
- The reader seam takes `Uint8Array` and may be async. That is the one change reaching outside the new file, and 393 existing tests pass with it.
- The `Date` mapping in `simAthenaSqliteValue` belongs in the acceptance criteria. Without it a timestamp filter answers zero rows and the query still succeeds.
- `GZIP`, `ZSTD` and `BROTLI` are wired from `node:zlib` and belong there too.
- ORC stays refused, on the licence.

Three follow-ups are worth filing on top.

- A Glue `date` column rendering as a date, the way Athena renders one.
- `DataScannedInBytes` for a columnar table, from the per-column sizes in the footer, with hyparquet's `columns` option reading only what the query touches.
- Firehose `DataFormatConversionConfiguration`. A test needs it to produce Parquet the way production does.
