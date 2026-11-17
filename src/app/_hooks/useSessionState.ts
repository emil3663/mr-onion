import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

/**
 * Phase 46 (TFP-294): state kept for the browser session (sessionStorage), so leaving the run page for the site lookup
 * or the candidates and coming back, or reloading it, finds the run form and its generated suite as they were. A
 * drop-in for useState. Values are JSON.
 *
 * - Built on useSyncExternalStore: the server's render, and hydration's, use the default, then the stored value (the
 *   form fills in just after the first paint; the server can't know the session).
 * - Each key is read from storage once, then from memory, which returns the same string, so a large value isn't copied
 *   or compared on every render (the fresh-context review).
 * - A key named "<group>.<name>" belongs to its group: if one of a group's writes is refused (storage's quota, private
 *   mode), the whole group is removed from storage and kept in memory for the page's life, so a reload restores all of
 *   it or none of it, never a suite without its page data.
 * - A setter called after its component unmounted does nothing, as useState's does: a generation still answering for
 *   a page that was left can't overwrite a newer one's suite.
 */

const PREFIX = "mronion.";
const memory = new Map<string, string | null>();
const memoryOnly = new Set<string>();
const listeners = new Set<() => void>();
const groupOf = (key: string) => key.split(".")[0];

function storage(): Storage | null {
    try {
        return typeof window === "undefined" ? null : window.sessionStorage;
    } catch {
        return null;
    }
}

function read(key: string): string | null {
    if (memory.has(key)) return memory.get(key)!;
    let stored: string | null = null;
    try {
        stored = storage()?.getItem(PREFIX + key) ?? null;
    } catch { /* unavailable: nothing stored */ }
    memory.set(key, stored);
    return stored;
}

function dropGroup(group: string) {
    memoryOnly.add(group);
    const store = storage();
    if (!store) return;
    try {
        for (const name of Object.keys(store)) if (name.startsWith(`${PREFIX}${group}.`)) store.removeItem(name);
    } catch { /* nothing more to remove */ }
}

function write(key: string, raw: string) {
    memory.set(key, raw);
    const group = groupOf(key);
    if (!memoryOnly.has(group)) {
        try {
            const store = storage();
            if (!store) throw new Error("no session storage");
            store.setItem(PREFIX + key, raw);
        } catch {
            dropGroup(group);
        }
    }
    for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
    // The default as first given, kept as useState keeps its own.
    const [fallback] = useState(initial);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
    const value = useMemo(() => {
        if (raw === null) return fallback;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
    }, [raw, fallback]);
    const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
        if (!mounted.current) return;
        const stored = read(key);
        let current = fallback;
        if (stored !== null) {
            try {
                current = JSON.parse(stored) as T;
            } catch { /* the default */ }
        }
        const resolved = typeof next === "function" ? (next as (previous: T) => T)(current) : next;
        write(key, JSON.stringify(resolved ?? null));
    }, [key, fallback]);
    return [value, set];
}
