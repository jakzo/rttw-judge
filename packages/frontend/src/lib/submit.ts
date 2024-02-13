import type { JudgeResultWithCount, Puzzle } from "@codepuzzles/common";

// TODO: can we make this not block the browser?
export async function evalInBrowser(
  puzzle: Puzzle,
  solution: string,
): Promise<JudgeResultWithCount> {
  // TODO: would be nice to count tokens AND characters (smallest tokens, and smallest solution)
  const numChars = solution.replace(/\s*/g, "").length;
  try {
    const { name, source } = puzzle;
    const code = `var ${name} = (function () { ${source}; return ${name}; })(); ${name}(${solution});`;
    const value = await evalInIframe(code);
    const passed = value === true;
    return { passed, value: String(value), numChars };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { passed: false, error, numChars };
  }
}

function evalInIframe(code: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    const src = `${FRONTEND_BASE_URL}/submit.html`;
    iframe.setAttribute("src", src);
    iframe.setAttribute("sandbox", "allow-scripts");
    document.body.append(iframe);
    iframe.onerror = function (err) {
      console.error(err);
    };
    iframe.onload = function () {
      iframe.contentWindow?.postMessage(code, "*");
    };

    let id = 0;
    const waitForMessage = (event: MessageEvent<unknown>) => {
      clearTimeout(id);
      if (
        event.source === iframe.contentWindow ||
        event.source === iframe.contentDocument
      ) {
        const obj = event.data && typeof event.data === "object";
        if (obj && "result" in event.data) resolve(Boolean(event.data.result));
        else if (obj && "error" in event.data) reject(String(event.data.error));
        else reject(new Error("Unknown error executing code"));
        window.removeEventListener("message", waitForMessage);
        iframe.remove();
      }
    };
    window.addEventListener("message", waitForMessage);

    id = window.setTimeout(() => {
      window.removeEventListener("message", waitForMessage);
      reject(new Error("Timed out"));
    }, 5_000);
  });
}

let cachedSubmit: Promise<JudgeResultWithCount> | null = null;
export async function submitToBackend(
  puzzle: Puzzle,
  solution: string,
): Promise<JudgeResultWithCount> {
  if (cachedSubmit) return cachedSubmit;

  try {
    return await (cachedSubmit = inner());
  } finally {
    cachedSubmit = null;
  }

  async function inner() {
    const resp = await fetch(`${API_BASE_URL}/judge/firefox/119.0`, {
      method: "POST",
      body: JSON.stringify({
        puzzleId: puzzle.id,
        solution,
      }),
      credentials: "include",
    });

    if (!resp.ok) {
      throw new Error(
        `Unexpected response: ${resp.status}\n${await resp.text()}`,
      );
    }

    return resp.json();
  }
}
