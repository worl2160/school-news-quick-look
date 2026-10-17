import { fetchNss } from "./nss.js";
import { fetchWpNetview } from "./wp-netview.js";
import { fetchWpLatestPosts } from "./wp-latest-posts.js";
import { fetchPhpbb } from "./php-phpbb.js";
import { fetchXoops } from "./php-xoops.js";

/** Adapter name (as written in the school list) → async (school, http, now, previousItems) => Item[]. */
export const adapters = {
  nss: fetchNss,
  "wp-netview": fetchWpNetview,
  "wp-latest-posts": fetchWpLatestPosts,
  "php-phpbb": fetchPhpbb,
  "php-xoops": fetchXoops,
};
