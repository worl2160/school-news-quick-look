import { fetchNss } from "./nss.js";
import { fetchWpNetview } from "./wp-netview.js";
import { fetchWpLatestPosts } from "./wp-latest-posts.js";
import { fetchPhpbb } from "./php-phpbb.js";
import { fetchXoops } from "./php-xoops.js";
import { fetchYascms } from "./py-yascms.js";
import { fetchRpage } from "./php-rpage.js";
import { fetchIweb } from "./x-iweb.js";

/** Adapter name (as written in the school list) → async (school, http, now, previousItems) => Item[]. */
export const adapters = {
  nss: fetchNss,
  "wp-netview": fetchWpNetview,
  "wp-latest-posts": fetchWpLatestPosts,
  "php-phpbb": fetchPhpbb,
  "php-xoops": fetchXoops,
  "py-yascms": fetchYascms,
  "php-rpage": fetchRpage,
  "x-iweb": fetchIweb,
};
