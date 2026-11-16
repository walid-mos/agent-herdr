import { exec, appHome, window } from "herdr";
import * as macos from "./pots-attachments-macos.js";
import * as linux from "./pots-attachments-linux.js";

// Herdr draws an image only from its own folder, so a file stays there for a week and its message shows it.
const FOLDER = "data/pots/attachments";
// hc carries at most this much to a sandbox on standard input.
const MAX_MEGABYTES = 8;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const DRAWN = /\.(png|jpe?g|gif|webp)$/i;
const EXTENSION = /\.[a-z0-9]+$/i;
const PASTED_NAME = "pasted-image.png";
const STAGE = 'mkdir -p "$1" && find "$1" -type f -mtime +7 -delete && cp "$2" "$1/$3" && wc -c < "$1/$3"';
let staged = 0;

const folder = () => `${appHome()}/${FOLDER}`;

async function output(command, arguments_, failure) {
  const result = await exec(command, arguments_);
  if (result.code !== 0) throw new Error(failure);
  return result.stdout.trim();
}

export const unstage = attachment => exec("rm", ["-f", attachment.path]);

export async function stageFile(path) {
  const name = path.split("/").at(-1);
  const stored = `${Date.now()}-${++staged}${EXTENSION.exec(name)?.[0] ?? ""}`;
  const bytes = Number(await output("sh", ["-c", STAGE, "sh", folder(), path, stored], `${name} could not be read.`));
  const attachment = { id: stored, name, path: `${folder()}/${stored}`, preview: DRAWN.test(name) ? `${FOLDER}/${stored}` : null };
  if (bytes <= MAX_MEGABYTES * BYTES_PER_MEGABYTE) return attachment;
  await unstage(attachment);
  throw new Error(`${name} is over ${MAX_MEGABYTES} MB, the most a message can carry.`);
}

const natives = { macos, linux };

function native() {
  const { platform } = window();
  if (!natives[platform]) throw new Error(`Attachments are not available on ${platform} yet.`);
  return natives[platform];
}

export const chooseFiles = () => native().chooseFiles();

export const stageClipboard = async () => stageFile(await native().readClipboard(folder(), PASTED_NAME));
