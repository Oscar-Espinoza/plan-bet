/**
 * Fail when a document body exceeds 13_000 bytes.
 * Sends `accept-encoding: gzip` and counts the encoded bytes on the wire.
 * Global fetch would decompress the body, so this uses node:http(s).
 */
import http from "node:http";
import https from "node:https";

const LIMIT = 13_000;

/**
 * @param {string} url
 * @param {number} redirects
 * @returns {Promise<{ url: string, status: number, bytes: number, encoding: string }>}
 */
function fetchEncoded(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      target,
      {
        method: "GET",
        headers: {
          "accept-encoding": "gzip",
          accept: "text/html",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= 5) {
            reject(new Error(`${url} redirected too many times`));
            return;
          }
          const next = new URL(res.headers.location, target).href;
          resolve(fetchEncoded(next, redirects + 1));
          return;
        }
        /** @type {Buffer[]} */
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            url,
            status,
            bytes: Buffer.concat(chunks).length,
            encoding: String(res.headers["content-encoding"] ?? "identity"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("usage: node scripts/doc-budget.mjs <url> [url...]");
  process.exit(1);
}

let failed = false;
for (const url of urls) {
  const result = await fetchEncoded(url);
  const over = result.status !== 200 || result.bytes > LIMIT;
  if (over) failed = true;
  console.log(
    `${over ? "OVER" : "OK"} ${result.bytes} ${result.encoding} ${result.status} ${url}`,
  );
}

if (failed) process.exit(1);
