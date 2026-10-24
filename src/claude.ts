import { spawn } from "node:child_process";
import { z } from "zod";

const MODEL = process.env.TRAILER_MODEL ?? "claude-opus-5-5";
const TIMEOUT_MS = Number(process.env.TRAILER_CLAUDE_TIMEOUT_MS ?? 20 * 60_000);

/** Result line of `claude -p --output-format json`. */
interface CliResult {
  is_error?: boolean;
  subtype?: string;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
}

interface AgentOptions<S extends z.ZodType> {
  schema: S;
  system: string;
  prompt: string;
  /** The agent reads files from here (read-only tools). */
  cwd: string;
  /** Extra folders it may read, e.g. the screenshots under review. */
  addDirs?: string[];
}

/**
 * Runs Claude Code headless as a read-only agent over `cwd`, and validates its structured answer.
 * Uses the Claude Code login (subscription), no API key.
 */
export async function agent<S extends z.ZodType>(opts: AgentOptions<S>): Promise<z.infer<S>> {
  const tools = "Read,Glob,Grep";
  const args = [
    "-p",
    "--output-format", "json",
    "--model", MODEL,
    "--append-system-prompt", opts.system,
    "--json-schema", JSON.stringify(z.toJSONSchema(opts.schema, { target: "draft-7", io: "input" })),
    "--tools", tools,
    "--allowedTools", tools,
    "--no-session-persistence",
    ...(opts.addDirs ?? []).flatMap((d) => ["--add-dir", d]),
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("claude", args, { cwd: opts.cwd, timeout: TIMEOUT_MS, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
    child.on("error", (e) =>
      reject((e as NodeJS.ErrnoException).code === "ENOENT" ? new Error("`claude` not found: install Claude Code and log in") : e),
    );
    child.on("close", (code, signal) => {
      if (signal) reject(new Error(`claude was killed (${signal})`));
      // A failed run still prints its JSON result (is_error), which says more than the exit code.
      else if (code !== 0 && !out.trim()) reject(new Error(`claude exited with code ${code}: ${err.slice(-2000)}`));
      else resolve(out);
    });
    child.stdin.end(opts.prompt);
  });

  const result = JSON.parse(stdout) as CliResult;
  if (result.is_error) throw new Error(`Claude Code failed (${result.subtype ?? "error"}): ${result.result ?? ""}`);
  if (result.structured_output === undefined) throw new Error("Claude Code returned no structured output");
  return opts.schema.parse(result.structured_output);
}
