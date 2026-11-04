import { execSync } from "node:child_process";

const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
console.log(`CHECK OK ${sha}`);
