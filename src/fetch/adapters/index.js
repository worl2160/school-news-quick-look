import { fetchNss } from "./nss.js";

/** Adapter name (as written in the school list) → async (school, http, now) => Item[]. */
export const adapters = { nss: fetchNss };
