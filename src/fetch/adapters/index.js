import { fetchNss } from "./nss.js";
import { fetchWpNetview } from "./wp-netview.js";

/** Adapter name (as written in the school list) → async (school, http, now, previousItems) => Item[]. */
export const adapters = { nss: fetchNss, "wp-netview": fetchWpNetview };
