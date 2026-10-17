// The only way the fetcher talks to school sites: a fixed User-Agent, no cookies,
// a pause between requests, and a timeout on each one.
export const USER_AGENT =
  "school-news-quick-look/1.0 (+https://github.com/worl2160/school-news-quick-look)";

export class FetchError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createHttp({ fetchImpl = fetch, minGapMs = 1000, timeoutMs = 20000, sleep = realSleep } = {}) {
  let sent = false;

  async function request(url, init) {
    if (sent) await sleep(minGapMs);
    sent = true;
    let res;
    try {
      res = await fetchImpl(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init.headers },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e.name === "TimeoutError") throw new FetchError(`${url}: timed out`);
      // Node's fetch says only "fetch failed"; the cause holds the socket, DNS or TLS error.
      const c = e.cause;
      const why = c ? ` (${[c.code, c.message].filter(Boolean).join(": ")})` : "";
      throw new FetchError(`${url}: ${e.message}${why}`);
    }
    if (!res.ok) throw new FetchError(`${url}: HTTP ${res.status}`, res.status);
    return { url: res.url || url, text: await res.text() };
  }

  return {
    getText: async (url) => (await request(url, { method: "GET", headers: {} })).text,
    /** Like getText, plus the URL the page was finally served from after redirects. */
    getPage: (url) => request(url, { method: "GET", headers: {} }),
    async postJson(url, body) {
      const { text } = await request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      try {
        return JSON.parse(text);
      } catch {
        throw new FetchError(`${url}: reply is not JSON`);
      }
    },
  };
}
