import { randomUUID } from "node:crypto";
import { enrichDueFixtures } from "../src/data/fixture-context";

const result = await enrichDueFixtures({ requestId: randomUUID() });

console.info(JSON.stringify(result, null, 2));
// Nothing due is a success: everything inside the horizon is already built and
// still fresh. Only a locked or unconfigured run, or a fixture that actually
// failed, is worth a non-zero exit.
if (!result.ok || result.failed > 0) {
  process.exitCode = 1;
}
