/**
 * Buddy quota, grounding, and notes against a local preview worker.
 *
 *   node --experimental-strip-types scripts/verify/buddy-scenario.ts
 *
 * Starts a stub OpenAI server and a preview worker on ports 8790–8799,
 * then stops both by PID. Prints BUDDY SCENARIO OK only when every step passed.
 *
 * (a) key unset: deterministic per-fact reply, no user claim row, stub not hit
 * (b) key invalid: claim row exists before the stub sees the request; failure frame
 * (c) 31st session turn is refused before any stub hit
 * (d) 101st turn from one IP hash is refused
 * (e) unknown [fact-id] → terminal ok:false, stored rejected
 * (f) valid reply streams, terminal ok:true, prose has no "["
 * (g) DELETE /api/buddy clears notes
 */
import { execFileSync, spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import { createServer as netServer } from "node:net";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GAME_ROUTE = "/games/mlb-nyy-01";
const failures: string[] = [];
const children: number[] = [];

let stubHits = 0;
let lastHitAt = 0;
let stubMode: "reject" | "unknown" | "ok" = "reject";
let workerPid: number | undefined;

function fail(step: string, detail: string) {
  const line = `${step}: ${detail}`;
  failures.push(line);
  console.error(`FAIL ${line}`);
}

function pass(step: string) {
  console.log(`PASS ${step}`);
}

function portFree(port: number) {
  return new Promise<boolean>((resolveFree) => {
    const server = netServer();
    server.once("error", () => resolveFree(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolveFree(true));
    });
  });
}

async function pickPorts() {
  for (let worker = 8790; worker <= 8797; worker += 1) {
    const stub = worker + 1;
    if ((await portFree(worker)) && (await portFree(stub))) {
      return { worker, stub };
    }
  }
  throw new Error("No free port pair in 8790-8798");
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function d1(command: string) {
  let stdout = "";
  let stderr = "";
  try {
    stdout = execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--local",
        "--env",
        "preview",
        "--json",
        "--command",
        command,
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    stdout = failed.stdout?.toString() ?? "";
    stderr = failed.stderr?.toString() ?? "";
    throw new Error(
      `D1 command failed: ${command}\n${stderr}\n${stdout}`.slice(0, 2000),
    );
  }
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error(`D1 output was not JSON: ${stdout.slice(0, 500)}`);
  }
  const parsed = JSON.parse(stdout.slice(start, end + 1)) as {
    results?: Record<string, unknown>[];
  }[];
  return parsed[0]?.results ?? [];
}

function countUserRows(conversation: string) {
  const rows = d1(
    `select count(*) as n from buddy_messages where role = 'user' and conversation = ${sqlString(conversation)}`,
  );
  return Number(rows[0]?.n ?? 0);
}

function resetBuddyRows() {
  d1("delete from buddy_notes");
  d1("delete from buddy_messages");
}

function killPid(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal);
  } catch {
    // already gone
  }
}

function descendantPids(pid: number): number[] {
  let text = "";
  try {
    text = execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
  } catch {
    return [];
  }
  const direct = text
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((value) => value > 0);
  return direct.flatMap((child) => [child, ...descendantPids(child)]);
}

function stopPid(pid: number) {
  const pids = [pid, ...descendantPids(pid)];
  for (const target of pids) killPid(target, "SIGTERM");
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const alive = pids.filter((target) => {
      try {
        process.kill(target, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (alive.length === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  for (const target of pids) killPid(target, "SIGKILL");
}

async function waitForHttp(url: string, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startWorker(port: number) {
  const logFd = openSync("/tmp/t12-buddy-wrangler.log", "a");
  const child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--env",
      "preview",
      "--port",
      String(port),
      "--ip",
      "127.0.0.1",
    ],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );
  closeSync(logFd);
  if (!child.pid) throw new Error("wrangler did not start");
  child.unref();
  children.push(child.pid);
  workerPid = child.pid;
  return child.pid;
}

function writeDevVars(text: string) {
  writeFileSync(resolve(root, ".dev.vars"), text);
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk as Buffer));
    request.on("end", () =>
      resolveBody(Buffer.concat(chunks).toString("utf8")),
    );
    request.on("error", rejectBody);
  });
}

function sseFrames(text: string) {
  const events: {
    type?: string;
    ok?: boolean;
    prose?: string;
    reason?: string;
  }[] = [];
  for (const frame of text.split("\n\n")) {
    const line = frame.split("\n").find((item) => item.startsWith("data:"));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as (typeof events)[number]);
    } catch {
      // ignore a partial frame
    }
  }
  return events;
}

function openaiStream(deltas: string[]) {
  const frames = deltas.map(
    (delta) =>
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta })}\n\n`,
  );
  frames.push(
    `data: ${JSON.stringify({
      type: "response.completed",
      response: {
        model: "stub",
        usage: { input_tokens: 12, output_tokens: 8 },
      },
    })}\n\n`,
  );
  return frames.join("");
}

async function postBuddy(base: string, body: Record<string, unknown>) {
  return fetch(`${base}/api/buddy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
    },
    body: JSON.stringify(body),
  });
}

function turnBody(question: string, sessionId = randomUUID()) {
  return {
    conversation: randomUUID(),
    sessionId,
    route: GAME_ROUTE,
    question,
  };
}

async function main() {
  if (!existsSync(resolve(root, ".svelte-kit/cloudflare/_worker.js"))) {
    throw new Error("Missing worker bundle. Run pnpm build first.");
  }
  const previousVars = existsSync(resolve(root, ".dev.vars"))
    ? readFileSync(resolve(root, ".dev.vars"), "utf8")
    : null;
  const { worker, stub } = await pickPorts();
  const base = `http://127.0.0.1:${worker}`;
  const stubUrl = `http://127.0.0.1:${stub}/v1/responses`;
  console.log(`ports worker=${worker} stub=${stub}`);

  const stubServer = createServer(async (request, response) => {
    const url = request.url ?? "/";
    if (url.startsWith("/status")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ hits: stubHits, lastHitAt, mode: stubMode }),
      );
      return;
    }
    if (url.startsWith("/reset")) {
      stubHits = 0;
      lastHitAt = 0;
      response.writeHead(204);
      response.end();
      return;
    }
    if (url.startsWith("/mode")) {
      const raw = await readBody(request);
      const next = JSON.parse(raw) as { mode?: typeof stubMode };
      if (
        next.mode === "reject" ||
        next.mode === "unknown" ||
        next.mode === "ok"
      ) {
        stubMode = next.mode;
      }
      response.writeHead(204);
      response.end();
      return;
    }
    stubHits += 1;
    lastHitAt = Date.now();
    await readBody(request);
    if (stubMode === "unknown") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(openaiStream(["No basis for that [not-a-real-fact]."]));
      return;
    }
    if (stubMode === "ok") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        openaiStream([
          "Home side has the better of this. ",
          "[f1]",
          ". [note: likes the short version]",
        ]),
      );
      return;
    }
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "invalid api key" } }));
  });

  const secret = "RATE_LIMIT_HASH_SECRET=buddy-verify-secret\n";
  const baseLine = `OPENAI_BASE_URL=${stubUrl}\n`;

  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      stubServer.once("error", rejectListen);
      stubServer.listen(stub, "127.0.0.1", () => resolveListen());
    });
    execFileSync("pnpm", ["db:migrate:local"], {
      cwd: root,
      stdio: "inherit",
    });
    resetBuddyRows();

    writeDevVars(`${secret}${baseLine}`);
    startWorker(worker);
    await waitForHttp(`${base}/rules`);

    const unset = turnBody("What do you make of the facts?");
    const unsetResponse = await postBuddy(base, unset);
    const unsetText = await unsetResponse.text();
    const unsetEvents = sseFrames(unsetText);
    const unsetDone = unsetEvents.find((event) => event.type === "done");
    const unsetClaims = countUserRows(String(unset.conversation));
    if (
      unsetResponse.status === 200 &&
      unsetDone?.ok === true &&
      unsetDone.reason === "ai_unconfigured" &&
      typeof unsetDone.prose === "string" &&
      unsetDone.prose.includes("AI isn't configured") &&
      unsetDone.prose.includes("[") &&
      unsetClaims === 0 &&
      stubHits === 0
    ) {
      pass("(a) key unset: per-fact reply, no claim, no model call");
    } else {
      fail(
        "(a)",
        `status=${unsetResponse.status} done=${JSON.stringify(unsetDone)} claims=${unsetClaims} hits=${stubHits} body=${unsetText.slice(0, 300)}`,
      );
    }

    stopPid(workerPid!);
    workerPid = undefined;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));

    writeDevVars(`${secret}OPENAI_API_KEY=invalid\n${baseLine}`);
    startWorker(worker);
    await waitForHttp(`${base}/rules`);
    await fetch(`http://127.0.0.1:${stub}/reset`, { method: "POST" });
    stubHits = 0;

    const claimQuestion = `claim-order ${randomUUID()}`;
    const beforeClaim = Date.now();
    const claimBody = turnBody(claimQuestion);
    const claimResponse = await postBuddy(base, claimBody);
    const claimText = await claimResponse.text();
    const claimDone = sseFrames(claimText).find(
      (event) => event.type === "done",
    );
    const claimRows = d1(
      `select created_at as createdAt from buddy_messages where role = 'user' and conversation = ${sqlString(String(claimBody.conversation))}`,
    );
    const createdAt = Number(claimRows[0]?.createdAt ?? 0);
    if (
      claimResponse.status === 200 &&
      claimDone?.ok === false &&
      claimRows.length === 1 &&
      createdAt >= beforeClaim &&
      createdAt <= lastHitAt &&
      stubHits === 1
    ) {
      pass("(b) invalid key: claim before the call, failure frame");
    } else {
      fail(
        "(b)",
        `status=${claimResponse.status} done=${JSON.stringify(claimDone)} createdAt=${createdAt} before=${beforeClaim} hitAt=${lastHitAt} hits=${stubHits} body=${claimText.slice(0, 300)}`,
      );
    }

    resetBuddyRows();
    await fetch(`http://127.0.0.1:${stub}/reset`, { method: "POST" });
    const sessionId = randomUUID();
    let sessionOk = true;
    let sessionDetail = "";
    for (let index = 1; index <= 30; index += 1) {
      const response = await postBuddy(
        base,
        turnBody(`session turn ${index} ${randomUUID()}`, sessionId),
      );
      if (response.status !== 200) {
        sessionOk = false;
        sessionDetail = `turn ${index} status ${response.status}`;
        break;
      }
      await response.text();
    }
    const hitsAfter30 = stubHits;
    const refused = await postBuddy(
      base,
      turnBody(`session turn 31 ${randomUUID()}`, sessionId),
    );
    const refusedPayload: unknown = await refused.json().catch(() => null);
    const refusedCode =
      refusedPayload &&
      typeof refusedPayload === "object" &&
      "error" in refusedPayload &&
      typeof (refusedPayload as { error?: { code?: unknown } }).error?.code ===
        "string"
        ? (refusedPayload as { error: { code: string } }).error.code
        : "";
    if (
      sessionOk &&
      hitsAfter30 === 30 &&
      stubHits === 30 &&
      refused.status === 429 &&
      refusedCode === "quota_exceeded"
    ) {
      pass("(c) 31st session turn refused before a model call");
    } else {
      fail(
        "(c)",
        `${sessionDetail} hitsAfter30=${hitsAfter30} hits=${stubHits} status=${refused.status} code=${refusedCode}`,
      );
    }

    resetBuddyRows();
    await fetch(`http://127.0.0.1:${stub}/reset`, { method: "POST" });
    let ipOk = true;
    let ipDetail = "";
    for (let index = 1; index <= 100; index += 1) {
      const response = await postBuddy(
        base,
        turnBody(`ip turn ${index} ${randomUUID()}`),
      );
      if (response.status !== 200) {
        ipOk = false;
        ipDetail = `turn ${index} status ${response.status}`;
        break;
      }
      await response.text();
    }
    const hitsAfter100 = stubHits;
    const ipRefused = await postBuddy(
      base,
      turnBody(`ip turn 101 ${randomUUID()}`),
    );
    const ipPayload: unknown = await ipRefused.json().catch(() => null);
    const ipCode =
      ipPayload &&
      typeof ipPayload === "object" &&
      "error" in ipPayload &&
      typeof (ipPayload as { error?: { code?: unknown } }).error?.code ===
        "string"
        ? (ipPayload as { error: { code: string } }).error.code
        : "";
    if (
      ipOk &&
      hitsAfter100 === 100 &&
      stubHits === 100 &&
      ipRefused.status === 429 &&
      ipCode === "quota_exceeded"
    ) {
      pass("(d) 101st IP-hash turn refused");
    } else {
      fail(
        "(d)",
        `${ipDetail} hitsAfter100=${hitsAfter100} hits=${stubHits} status=${ipRefused.status} code=${ipCode}`,
      );
    }

    resetBuddyRows();
    await fetch(`http://127.0.0.1:${stub}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "unknown" }),
    });
    const unknownBody = turnBody("Cite something you were not given.");
    const unknownResponse = await postBuddy(base, unknownBody);
    const unknownDone = sseFrames(await unknownResponse.text()).find(
      (event) => event.type === "done",
    );
    const rejected = d1(
      `select status, reason from buddy_messages where role = 'buddy' and conversation = ${sqlString(String(unknownBody.conversation))}`,
    );
    if (
      unknownResponse.status === 200 &&
      unknownDone?.ok === false &&
      unknownDone.reason === "unknown_fact" &&
      rejected[0]?.status === "rejected" &&
      rejected[0]?.reason === "unknown_fact"
    ) {
      pass("(e) unknown fact retracts and is stored rejected");
    } else {
      fail(
        "(e)",
        `status=${unknownResponse.status} done=${JSON.stringify(unknownDone)} row=${JSON.stringify(rejected[0])}`,
      );
    }

    resetBuddyRows();
    await fetch(`http://127.0.0.1:${stub}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ok" }),
    });
    const okBody = turnBody("Give me the short version.");
    const okResponse = await postBuddy(base, okBody);
    const okText = await okResponse.text();
    const okEvents = sseFrames(okText);
    const okDone = okEvents.find((event) => event.type === "done");
    const streamedBracket = okEvents.some(
      (event) => event.type === "delta" && JSON.stringify(event).includes("["),
    );
    const noteRows = d1("select count(*) as n from buddy_notes");
    const noteCount = Number(noteRows[0]?.n ?? 0);
    if (
      okResponse.status === 200 &&
      okDone?.ok === true &&
      typeof okDone.prose === "string" &&
      !okDone.prose.includes("[") &&
      streamedBracket &&
      noteCount === 1
    ) {
      pass("(f) valid reply streams, terminal prose has no brackets");
    } else {
      fail(
        "(f)",
        `status=${okResponse.status} done=${JSON.stringify(okDone)} bracketDelta=${streamedBracket} notes=${noteCount} body=${okText.slice(0, 400)}`,
      );
    }

    const forget = await fetch(`${base}/api/buddy`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
      },
      body: JSON.stringify({ sessionId: okBody.sessionId }),
    });
    const forgetPayload: unknown = await forget.json().catch(() => null);
    const forgotten =
      forgetPayload &&
      typeof forgetPayload === "object" &&
      "data" in forgetPayload &&
      (forgetPayload as { data?: { forgotten?: unknown } }).data?.forgotten ===
        true;
    const notesAfter = Number(
      d1("select count(*) as n from buddy_notes")[0]?.n ?? 0,
    );
    if (forget.status === 200 && forgotten && notesAfter === 0) {
      pass("(g) DELETE /api/buddy clears notes");
    } else {
      fail(
        "(g)",
        `status=${forget.status} forgotten=${forgotten} notes=${notesAfter}`,
      );
    }
  } finally {
    stubServer.close();
    if (workerPid) stopPid(workerPid);
    for (const pid of children) stopPid(pid);
    if (previousVars === null) {
      try {
        execFileSync("rm", ["-f", resolve(root, ".dev.vars")]);
      } catch {
        // already gone
      }
    } else {
      writeDevVars(previousVars);
    }
  }

  if (failures.length > 0) {
    console.error(`BUDDY SCENARIO FAIL ${failures.length}`);
    process.exit(1);
  }
  console.log("BUDDY SCENARIO OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (workerPid) stopPid(workerPid);
  for (const pid of children) stopPid(pid);
  process.exit(1);
});
