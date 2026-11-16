const RETIRED_WINDOWS = { claude: ["5 hours"] };

export const isShownWindow = (provider, window) => Boolean(window.resetsAt) || !(RETIRED_WINDOWS[provider] ?? []).includes(window.name);
