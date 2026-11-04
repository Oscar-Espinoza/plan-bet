import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const libMap = {
  contracts: "src/lib/server/domain/contracts.ts",
  seed: "src/lib/server/domain/seed.ts",
  logger: "src/lib/server/logger.ts",
  "team-logos": "src/lib/shared/team-logos.ts",
  "api-response": "src/lib/server/api-response.ts",
  "cron-auth": "src/lib/server/cron-auth.ts",
  "auth-config": "src/lib/server/auth-config.ts",
};

const prefixMap = {
  "@/data/": "src/lib/server/data/",
  "@/db/": "src/lib/server/db/",
  "@/providers/": "src/lib/server/providers/",
};

function relImport(fromFile, targetFile) {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, targetFile);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.ts$/, "");
}

function rewrite(content, filePath) {
  let out = content.replace(/^import "server-only";\n\n?/m, "");
  out = out.replace(/from "@\/lib\/([^"]+)"/g, (_, mod) => {
    const target = libMap[mod];
    if (!target) throw new Error(`Unknown @/lib/${mod} in ${filePath}`);
    return `from "${relImport(filePath, path.join(root, target))}"`;
  });
  for (const [prefix, base] of Object.entries(prefixMap)) {
    out = out.replace(
      new RegExp(`from "${prefix.replace("/", "\\/")}([^"]+)"`, "g"),
      (_, mod) => {
        const target = path.join(root, base, `${mod}.ts`);
        return `from "${relImport(filePath, target)}"`;
      },
    );
  }
  return out;
}

export function portFile(src, dest) {
  const srcPath = path.join(root, src);
  const destPath = path.join(root, dest);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const content = fs.readFileSync(srcPath, "utf8");
  fs.writeFileSync(destPath, rewrite(content, destPath));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [src, dest] of JSON.parse(process.argv[2] ?? "[]")) {
    portFile(src, dest);
  }
}
