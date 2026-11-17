/**
 * Phase 46 (TFP-233, the fresh-context review): the text of the confirmation's one refusal the form answers with a
 * note of its own (review item 4), shared so the two can't drift apart. No file-system imports: the form is a client
 * component, and `confirmation.ts` reads the data folder.
 */
export const HOST_NOT_USED = "isn't a host this site's address or crawl uses";

export const hostNotUsedReason = (host: string) => `"${host}" ${HOST_NOT_USED}: check it for a typing error`;
