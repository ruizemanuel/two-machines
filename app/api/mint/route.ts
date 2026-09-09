import { spawn } from "node:child_process";
import path from "node:path";
import { ROOT, cacheStatus, childEnv } from "../../../lib/gpu-server";
import { serialFromState } from "../../../lib/coin/serial";
import { SHADER_VERSION } from "../../../lib/coin/version";
import { mintRequest } from "../../../lib/coin/query";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  // Sizes restricted to the two the piece renders and the floats clamped to
  // their shader ranges — see lib/coin/query.ts for why the parameter space is
  // not the endpoint's to leave open.
  const { width, height, state } = mintRequest(new URL(request.url).searchParams);

  // Known before rendering: the serial comes from the state, not from the pixels.
  const serial = serialFromState(state, SHADER_VERSION);
  const args = [
    String(width), String(height),
    String(state.spin), String(state.melt),
    String(state.mouse[0]), String(state.mouse[1]),
    serial,
  ];

  const script = path.join(ROOT, "dist", "render-child.mjs");
  const started = Date.now();

  // The child process is not optional: the dynamic linker reads LD_LIBRARY_PATH
  // when the process starts and never again. Without this jump there is no
  // Vulkan adapter.
  const child = spawn(process.execPath, [script, ...args], {
    env: childEnv(), stdio: ["ignore", "pipe", "pipe"],
  });

  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on("data", (d) => out.push(d));
  child.stderr.on("data", (d) => err.push(d));
  // 'error' fires when the process could not be spawned at all — a fork that ran
  // out of resources, a permissions problem. With no listener the event throws
  // where nothing can catch it AND the promise never settles, so the request
  // hangs until maxDuration instead of failing in milliseconds. (A missing
  // script is not this case: node itself exists, so it just exits non-zero.)
  const code: number | null = await new Promise((resolve) => {
    child.on("error", (e: Error) => { err.push(Buffer.from(e.message)); resolve(-1); });
    child.on("close", resolve);
  });

  if (code !== 0) {
    return Response.json(
      {
        error: "render failed",
        detail: Buffer.concat(err).toString("utf8").slice(0, 2000),
        // What the function sees of its own bundle. A render failure is nearly
        // always the Vulkan cache not being where this code looks for it.
        env: cacheStatus(),
      },
      { status: 500 },
    );
  }

  return new Response(Buffer.concat(out), {
    headers: {
      "content-type": "image/png",
      // same state, same PNG: cacheable forever
      "cache-control": "public, max-age=31536000, immutable",
      "x-serial": serial,
      "x-render-ms": String(Date.now() - started),
    },
  });
}
