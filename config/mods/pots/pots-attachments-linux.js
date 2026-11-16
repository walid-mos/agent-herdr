import { exec } from "herdr";

const CHOOSER_PICKERS = [
  ["zenity", ["--file-selection", "--multiple", "--separator=\n", "--title=Attach to the message"]],
  ["kdialog", ["--getopenfilename", ".", "--multiple", "--separate-output", "--title", "Attach to the message"]],
];
const CHOOSER_CANCELLED = 1;
const CLIPBOARD_UNAVAILABLE = 2;
const FILE_URI = "file://";
const FIND_PICKER = 'command -v "$1"';
const READ_CLIPBOARD = `mkdir -p "$1" || exit 1
if [ -n "$WAYLAND_DISPLAY" ] && command -v wl-paste >/dev/null 2>&1; then
  list() { wl-paste --list-types; }; get() { wl-paste --type "$1"; }
elif command -v xclip >/dev/null 2>&1; then
  list() { xclip -selection clipboard -t TARGETS -o; }; get() { xclip -selection clipboard -t "$1" -o; }
else
  echo "Install wl-clipboard or xclip to attach from the clipboard." >&2; exit ${CLIPBOARD_UNAVAILABLE}
fi
types=$(list 2>/dev/null)
case "$types" in
  *text/uri-list*)
    copied=$(get text/uri-list | sed -n '/^file:/{p;q;}')
    if [ -n "$copied" ]; then printf '%s\n' "$copied"; exit 0; fi ;;
esac
case "$types" in
  *image/png*) get image/png > "$1/$2" && printf '%s\n' "$1/$2" ;;
esac`;

async function findPicker() {
  for (const [command, options] of CHOOSER_PICKERS) {
    if ((await exec("sh", ["-c", FIND_PICKER, "sh", command])).code === 0) return { command, options };
  }
  throw new Error("The file chooser needs zenity or kdialog. Install one, or drop the file on the message.");
}

/** Herdr gives a mod no file chooser, so the desktop's zenity or kdialog opens one. Closing it chooses nothing. */
export async function chooseFiles() {
  const { command, options } = await findPicker();
  const result = await exec(command, options);
  if (result.code === 0) return result.stdout.split("\n").filter(Boolean);
  if (result.code === CHOOSER_CANCELLED) return [];
  throw new Error(`The file chooser did not open. ${result.stderr.trim()}`);
}

/** Herdr gives a mod the clipboard's text only, so wl-paste or xclip reads a copied image or file. Resolves to the path of what was copied. */
export async function readClipboard(folder, name) {
  const result = await exec("sh", ["-c", READ_CLIPBOARD, "sh", folder, name]);
  if (result.code === CLIPBOARD_UNAVAILABLE) throw new Error(result.stderr.trim());
  const copied = result.stdout.trim();
  if (result.code !== 0 || !copied) throw new Error("The clipboard holds no image or file to attach.");
  if (!copied.startsWith(FILE_URI)) return copied;
  const local = /^file:\/\/(?:localhost)?(\/.*)$/.exec(copied);
  if (!local) throw new Error("The clipboard file must be on this computer.");
  return decodeURIComponent(local[1]);
}
