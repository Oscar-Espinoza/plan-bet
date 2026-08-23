import { randomUUID } from "node:crypto";
import { enrichDueFixtures } from "../src/data/fixture-context";

const result = await enrichDueFixtures({ requestId: randomUUID() });

console.info(JSON.stringify(result, null, 2));
if (!result.ok || result.built === 0) {
  process.exitCode = 1;
}
