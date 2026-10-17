import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSchools } from "../site/filter.js";

const schools = [
  { code: "1", name: "松山國小", district: "松山區" },
  { code: "2", name: "民生國小", district: "松山區" },
  { code: "3", name: "古亭國小", district: "大安區" },
];

test("shows no schools until a name is typed or a district is chosen", () => {
  assert.deepEqual(filterSchools(schools, { text: "", district: "" }), []);
  assert.deepEqual(filterSchools(schools, { text: "  ", district: "" }), []);
});

test("filters by district, by name, or both", () => {
  assert.deepEqual(filterSchools(schools, { text: "", district: "松山區" }).map((s) => s.code), ["1", "2"]);
  assert.deepEqual(filterSchools(schools, { text: "古亭", district: "" }).map((s) => s.code), ["3"]);
  assert.deepEqual(filterSchools(schools, { text: "民生", district: "松山區" }).map((s) => s.code), ["2"]);
});
