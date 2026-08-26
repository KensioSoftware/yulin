import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  aCatalogTable,
  anEngineSimulation,
  aSeededJson,
  type SimAthenaEngineSimulation,
} from "./sim-athena-engine.fixture.js";
import { anAnsweredQuery } from "./sim-athena-answered-query.fixture.js";

/** The orders one query in this file reads. */
const orders = [
  { id: 1, customer: "ada", amount: 10.5, refunded: false },
  { id: 2, customer: "bob", amount: 4, refunded: true },
  { id: 3, customer: "ada", amount: 7.25, refunded: false },
  { id: 4, customer: "cyd", amount: 22, refunded: false },
];

/** A simulation holding the orders, with the engine turned on. */
async function anOrderSimulation(): Promise<SimAthenaEngineSimulation> {
  const simulation = await anEngineSimulation();

  aCatalogTable(simulation.simAws, {
    name: "orders",
    columns: [
      { Name: "id", Type: "int" },
      { Name: "customer", Type: "string" },
      { Name: "amount", Type: "double" },
      { Name: "refunded", Type: "boolean" },
    ],
  });

  await aSeededJson(simulation.simAws, "orders/part-0.json", orders);
  await simulation.simAws.athena().engine().enable();

  return simulation;
}

describe("running an Athena query for real", () => {
  it("answers a filtered rollup from the objects a test seeded", async () => {
    // Given a table over four orders, with the engine on.
    const simulation = await anOrderSimulation();

    // When a query rolls them up by customer.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT customer, count(*) AS orders, sum(amount) AS spend " +
        "FROM rainlytics.orders WHERE refunded = false " +
        "GROUP BY customer HAVING sum(amount) > 5 " +
        "ORDER BY spend DESC LIMIT 2",
    );

    // Then the rows are what the data comes to, not what anybody declared.
    assertIdentical(answered.state, "SUCCEEDED");
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["cyd", "1", "22"],
      ["ada", "2", "17.75"],
    ]);
  });

  it("joins two tables in the catalog", async () => {
    // Given the orders and a second table naming each customer's tier.
    const simulation = await anOrderSimulation();

    aCatalogTable(simulation.simAws, {
      name: "tiers",
      columns: [
        { Name: "customer", Type: "string" },
        { Name: "tier", Type: "string" },
      ],
    });

    await aSeededJson(simulation.simAws, "tiers/part-0.json", [
      { customer: "ada", tier: "gold" },
      { customer: "bob", tier: "silver" },
    ]);

    // When a query joins them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT t.tier, count(*) AS orders FROM rainlytics.orders o " +
        "JOIN rainlytics.tiers t ON o.customer = t.customer " +
        "GROUP BY t.tier ORDER BY t.tier",
    );

    // Then the join is real, and the customer in neither table is dropped.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["gold", "2"],
      ["silver", "1"],
    ]);
  });

  it("answers a common table expression and a window function", async () => {
    // Given the orders, with the engine on.
    const simulation = await anOrderSimulation();

    // When a CTE feeds a window function.
    const answered = await anAnsweredQuery(
      simulation,
      "WITH kept AS (SELECT * FROM rainlytics.orders WHERE refunded = false) " +
        "SELECT customer, amount, " +
        "rank() OVER (PARTITION BY customer ORDER BY amount DESC) AS place " +
        "FROM kept ORDER BY customer, place",
    );

    // Then each customer's orders are ranked within their own partition.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [
      ["ada", "10.5", "1"],
      ["ada", "7.25", "2"],
      ["cyd", "22", "1"],
    ]);
  });

  it("resolves an unqualified table against the query's own database", async () => {
    // Given the orders, with the engine on.
    const simulation = await anOrderSimulation();

    // When a query names the table without its database, saying which
    // database it runs in.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(*) AS orders FROM orders",
      "rainlytics",
    );

    // Then it resolves the way it resolves on real Athena.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["4"]]);
  });

  it("reads a table twice over without loading it twice", async () => {
    // Given the orders, with the engine on.
    const simulation = await anOrderSimulation();

    // When a query names one table twice.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT count(*) AS pairs FROM rainlytics.orders a " +
        "JOIN rainlytics.orders b ON a.customer = b.customer AND a.id < b.id",
    );

    // Then the self join is over the four rows rather than eight.
    assertIdentical(answered.answeredBy, "engine");
    assertObjectEquals(answered.rows, [["1"]]);
  });

  it("shims the Trino functions SQLite does not have", async () => {
    // Given a table holding a timestamp, a path and a JSON document.
    const simulation = await anEngineSimulation();

    aCatalogTable(simulation.simAws, {
      name: "events",
      columns: [
        { Name: "at", Type: "timestamp" },
        { Name: "path", Type: "string" },
        { Name: "detail", Type: "string" },
      ],
    });

    await aSeededJson(simulation.simAws, "events/part-0.json", [
      {
        at: "2026-08-02T09:30:00Z",
        path: "/a/b/c",
        detail: '{"tenant":"acme"}',
      },
    ]);
    await simulation.simAws.athena().engine().enable();

    // When a query reaches for four of them.
    const answered = await anAnsweredQuery(
      simulation,
      "SELECT date_trunc('month', at) AS month, " +
        "split_part(path, '/', 2) AS head, strpos(path, 'b') AS at_b, " +
        "json_extract_scalar(detail, '$.tenant') AS tenant " +
        "FROM rainlytics.events",
    );

    // Then each one answers.
    assertObjectEquals(answered.rows, [["2026-08-01", "a", "4", "acme"]]);
  });
});
