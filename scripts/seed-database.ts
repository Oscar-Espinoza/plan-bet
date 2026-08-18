import { getDatabase } from "../src/db/client";
import { seedConfiguredTeams } from "../src/db/seed";

const seeded = await seedConfiguredTeams(getDatabase());
console.info(`Seeded ${seeded.length} configured soccer teams.`);
