#!/usr/bin/env node
/**
 * Free the dev server port, but only from our own server.
 *
 * webpack-dev-server dies with EADDRINUSE if anything already holds the port,
 * and the usual cause is a previous run of this project that was never stopped,
 * or was stopped in a way that left the listener behind. Restarting then fails
 * for a reason that has nothing to do with the change you just made.
 *
 * The important restriction is in the name: only OUR server. Blindly killing
 * whatever holds port 8080 would take out someone else's unrelated dev server,
 * which is a far worse failure than the one being fixed. So every candidate is
 * checked first, and anything foreign is reported and left alone.
 *
 * "Ours" means this repo OR a sibling RemNote theme. The themes share a port and
 * only one can be developed at a time, so hitting the other one's server is the
 * normal case when switching between them, not an accident. Refusing there just
 * meant reading a pid out of an error message and killing it by hand every time.
 * A sibling is identified by the `name` in the package.json above its working
 * directory, which is a much narrower signal than "something on port 8080".
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

/** How long to wait for a terminated process to actually release the port. */
const GRACE_MS = 3000;
const POLL_MS = 100;

/**
 * PIDs listening on the port.
 *
 * lsof is the portable option and covers macOS. ss is the fallback, since many
 * Linux installs no longer ship lsof by default.
 */
function listenersOn(port) {
  const pids = new Set();

  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) {
      const pid = Number.parseInt(line.trim(), 10);
      if (Number.isInteger(pid)) pids.add(pid);
    }
    return pids;
  } catch (err) {
    if (err.code !== 'ENOENT' && err.status !== 1) throw err;
    // status 1 from lsof means "nothing matched", which is not an error here.
    if (err.status === 1) return pids;
  }

  try {
    const out = execFileSync('ss', ['-tlnp'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) {
      if (!new RegExp(`[:.]${port}\\s`).test(line)) continue;
      for (const match of line.matchAll(/pid=(\d+)/g)) {
        pids.add(Number.parseInt(match[1], 10));
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    console.warn(`[free-port] neither lsof nor ss is available, cannot check port ${port}`);
  }

  return pids;
}

/**
 * Decide whether a process belongs to this project.
 *
 * Two independent signals, either of which is enough:
 *   - its working directory is inside this repo
 *   - its command line mentions this repo's path
 *
 * The command line matters because npm spawns the server as a child, and the
 * child can end up with a different cwd than the one npm was started in.
 */
function belongsToThisProject(pid) {
  const readProc = (name) => {
    try {
      return fs.readFileSync(`/proc/${pid}/${name}`, 'utf8');
    } catch {
      return null;
    }
  };

  try {
    const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
    if (cwd === ROOT || cwd.startsWith(ROOT + path.sep)) return true;
  } catch {
    // Not Linux, or the process is gone, or it is not ours to inspect.
  }

  const cmdline = readProc('cmdline');
  if (cmdline && cmdline.split('\0').join(' ').includes(ROOT)) return true;

  // On platforms without /proc, fall back to asking ps for the command line.
  if (!cmdline) {
    try {
      const out = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (out.includes(ROOT)) return true;
    } catch {
      // Nothing more to go on. Treated as foreign, which is the safe default.
    }
  }

  return false;
}

/**
 * Is this the package name of one of our RemNote projects?
 *
 * The themes and this plugin all serve on 8080 and only one can be developed at
 * a time, so hitting a sibling's server is the normal case when switching
 * between them, not an accident. Refusing there just meant reading a pid out of
 * an error message and killing it by hand every time.
 *
 * Still deliberately narrow: matching on "any node process" or "anything under
 * ~/src" would bring back exactly the failure this script exists to avoid.
 */
export function isThemeProjectName(name) {
  return typeof name === 'string' && /^remnote-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

/**
 * The package name of the project a process is running in, if any.
 *
 * Walks up from the process working directory looking for a package.json. The
 * server is started from the repo root in practice, but a couple of levels of
 * tolerance costs nothing and covers being launched from a subdirectory.
 */
function projectNameOf(pid) {
  let dir;
  try {
    dir = fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }

  for (let depth = 0; depth < 6 && dir && dir !== path.parse(dir).root; depth++) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        return JSON.parse(fs.readFileSync(manifest, 'utf8')).name ?? null;
      } catch {
        return null;
      }
    }
    dir = path.dirname(dir);
  }

  return null;
}

/** A dev server from one of our other themes, rather than from this repo. */
function belongsToSiblingTheme(pid) {
  const name = projectNameOf(pid);
  return isThemeProjectName(name) ? name : null;
}

function describe(pid) {
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ');
    return cmd.slice(0, 90) || `pid ${pid}`;
  } catch {
    return `pid ${pid}`;
  }
}

function stillListening(port) {
  return listenersOn(port).size > 0;
}

async function main() {
  const pids = listenersOn(PORT);
  if (pids.size === 0) return;

  const ours = [...pids].filter(belongsToThisProject);
  const siblings = [...pids]
    .filter((pid) => !ours.includes(pid))
    .map((pid) => ({ pid, project: belongsToSiblingTheme(pid) }))
    .filter((entry) => entry.project !== null);
  const foreign = [...pids].filter(
    (pid) => !ours.includes(pid) && !siblings.some((entry) => entry.pid === pid)
  );

  if (foreign.length > 0) {
    // Deliberately not killed. Something else on this machine is using the
    // port and it is not this script's business.
    console.error(`[free-port] port ${PORT} is held by a process that is not from this project:`);
    for (const pid of foreign) console.error(`             ${pid}  ${describe(pid)}`);
    console.error(`[free-port] stop it yourself, or run with a different port: PORT=8081 npm run dev`);
    process.exit(1);
  }

  // Stopping another project's server is a real side effect, so it is reported
  // by name rather than folded in silently with our own leftovers.
  for (const { pid, project } of siblings) {
    console.log(`[free-port] port ${PORT} is held by ${project}; stopping it to take over`);
    console.log(`[free-port]   ${pid}  ${describe(pid)}`);
  }

  const toStop = [...ours, ...siblings.map((entry) => entry.pid)];

  for (const pid of ours) {
    console.log(`[free-port] stopping previous dev server ${pid} (${describe(pid)})`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      if (err.code !== 'ESRCH') throw err;
    }
  }

  for (const { pid } of siblings) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      if (err.code !== 'ESRCH') throw err;
    }
  }

  // Wait for the port to actually come free. Exiting early just moves the
  // EADDRINUSE to the next command.
  const deadline = Date.now() + GRACE_MS;
  while (Date.now() < deadline) {
    if (!stillListening(PORT)) {
      console.log(`[free-port] port ${PORT} released`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  console.warn(`[free-port] still held after ${GRACE_MS}ms, sending SIGKILL`);
  for (const pid of toStop) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (err) {
      if (err.code !== 'ESRCH') throw err;
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  if (stillListening(PORT)) {
    console.error(`[free-port] could not free port ${PORT}`);
    process.exit(1);
  }
  console.log(`[free-port] port ${PORT} released`);
}

// Only when run as a command. This module exports helpers that tests import,
// and an unguarded call meant importing it KILLED whatever dev server happened
// to be running -- found exactly that way.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main();
