import { getDomain } from "tldts";
import { hostsTheCrawlRecorded } from "@/lib/ownership/confirmation";

/**
 * Phase 46 (TFP-297; Gate B's D1 ruling, owner, 2026-11-17): the site's own hosts, for the covered-host guard's note
 * "add <host> to this site's confirmation". A host is one of the site's own when it is same-site with the target: the
 * same registrable domain by the Public Suffix List (tldts, its private section included, as a browser's same-site
 * check reads it), so `api.example.com` is the site's own for `shop.example.com`, and `other.co.uk` is not for
 * `shop.example.co.uk`. An IP address or localhost has no registrable domain and matches only itself. The hosts of the
 * pages the crawl visited always count. Everything else the crawl recorded (a third-party script, another site's
 * frame or form action) is not the site's own, and its stopped reads stay plain notes.
 *
 * Not caught (known limitation 16): a page on an IP address reading from localhost, or the reverse, and an API on an
 * unrelated domain; a same-site host the crawl never recorded isn't named either (the guard knows only what is passed).
 */
export function sameSite(host: string, target: string) {
    const a = host.toLowerCase();
    const b = target.toLowerCase();
    if (a === b) return true;
    const domain = getDomain(a, { allowPrivateDomains: true });
    return domain !== null && domain === getDomain(b, { allowPrivateDomains: true });
}

/** The site's own hosts the crawl recorded, besides the target's: its pages' hosts, and every request host same-site with the target. */
export async function ownHostsOfSite(origin: string): Promise<Set<string>> {
    const target = new URL(origin).hostname;
    const { pageHosts, requestHosts } = await hostsTheCrawlRecorded(origin);
    return new Set([target, ...pageHosts, ...[...requestHosts].filter((host) => sameSite(host, target))]);
}
