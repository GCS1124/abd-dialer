import assert from "node:assert/strict";
import test from "node:test";

import { buildRingCentralCallLogId } from "./ringcentralCallLogId.ts";

test("buildRingCentralCallLogId returns a deterministic version-5 uuid shape", async () => {
  const first = await buildRingCentralCallLogId("s-abc123");
  const second = await buildRingCentralCallLogId("s-abc123");
  const different = await buildRingCentralCallLogId("s-def456");

  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.match(first, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
