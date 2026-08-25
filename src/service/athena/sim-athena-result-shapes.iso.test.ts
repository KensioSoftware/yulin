import {
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAthenaResultCsv } from "./execution/sim-athena-result-csv.js";
import { simAthenaWriteFailureReason } from "./execution/sim-athena-write-failure.js";
import { SimAthenaResolvedResult } from "./result/sim-athena-resolved-result.js";

describe("simulated Athena declared result shapes", () => {
  it("names the columns of a result that declared none", () => {
    // Given rows declared without column names.
    const result = new SimAthenaResolvedResult({ rows: [["a", "b"]] });

    // When the columns are read.
    // Then they carry the names Athena gives a column a query left unnamed.
    assertIdentical(result.columns[0]?.name, "_col0");
    assertIdentical(result.columns[1]?.name, "_col1");
    assertIdentical(result.columns[0].type, "varchar");
  });

  it("takes a column declared with its own type", () => {
    // Given three columns: a bare name, an object naming a type, and an
    // object leaving the type out.
    const result = new SimAthenaResolvedResult({
      columns: ["path", { name: "views", type: "bigint" }, { name: "day" }],
      rows: [["/", "1", "2026-08-25"]],
    });

    // When the columns are read.
    // Then only the one that named a type has anything but the default.
    assertIdentical(result.columns[0]?.type, "varchar");
    assertIdentical(result.columns[1]?.type, "bigint");
    assertIdentical(result.columns[2]?.type, "varchar");
  });

  it("says why a query whose results could not be written failed", () => {
    // Given a write that failed, once with an Error and once with something
    // that was never one.
    // When each is turned into the reason the execution carries.
    const fromError = simAthenaWriteFailureReason(new Error("Access Denied"));
    const fromAnything = simAthenaWriteFailureReason("the Bucket went away");

    // Then both name the output location as where it went wrong.
    assertStringIncludes(fromError, "could not be written");
    assertStringIncludes(fromError, "Access Denied");
    assertStringIncludes(fromAnything, "the Bucket went away");
  });

  it("says whether a declared result fails", () => {
    // Given one result that fails and one that does not.
    const failing = new SimAthenaResolvedResult({ failsWith: "no such table" });
    const answering = new SimAthenaResolvedResult({ rows: [["1"]] });

    // When each is asked.
    // Then only the first says it fails.
    assertTrue(failing.fails);
    assertFalse(answering.fails);
  });

  it("quotes a value holding a quote of its own", () => {
    // Given a row whose value carries the character CSV delimits with.
    const result = new SimAthenaResolvedResult({
      columns: ["path"],
      rows: [['/say "hello"']],
    });

    // When it is rendered as the CSV Athena writes.
    const csv = simAthenaResultCsv(result);

    // Then the quote is doubled rather than ending the field early.
    assertIdentical(csv, '"path"\n"/say ""hello"""\n');
  });
});
