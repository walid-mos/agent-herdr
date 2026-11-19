const REQUEST_TIMEOUT_MS = 150000;
const PREPARE = 'umask 077; mkdir -p "$1" && chmod 700 "$1"';
const FEED = 'if [ -n "$1" ]; then exec hc exec --stdin --on "$1" -- node "$2" "$3" - < "$4"; else exec node "$2" "$3" - < "$4"; fi';
let serial = 0;

function decode(result) {
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || 'Pot control did not answer. Refresh before retrying.');
  return JSON.parse(result.stdout);
}

export function taskTransport({ exec, appHome, writeTextFile }, controlPath) {
  if (typeof controlPath !== 'string' || !controlPath.startsWith('/') || controlPath.includes('\0')) {
    throw new Error('Enter the absolute installed control path for this pot.');
  }
  return async (machine, operation, request) => {
    if (operation === 'snapshot') {
      return decode(await exec('node', [controlPath, operation], { ...(machine && { on: machine }), timeout: REQUEST_TIMEOUT_MS }));
    }
    const folder = `${appHome()}/data/task-handover`;
    const path = `${folder}/${Date.now()}-${++serial}.json`;
    decodePreparation(await exec('sh', ['-c', PREPARE, 'sh', folder]));
    try {
      await writeTextFile(path, JSON.stringify(request), null);
      return decode(await exec('sh', ['-c', FEED, 'sh', machine, controlPath, operation, path], { timeout: REQUEST_TIMEOUT_MS }));
    }
    finally {
      const removed = await exec('rm', ['-f', path]);
      if (removed.code !== 0) throw new Error('The private request file could not be removed. Inspect the Herdr data folder before retrying.');
    }
  };
}

function decodePreparation(result) {
  if (result.code !== 0) throw new Error(`The private request folder could not be prepared. ${result.stderr.trim()}`);
}
