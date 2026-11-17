"use client";

import { useEffect, useId, useState } from "react";

/**
 * Phase 46 (TFP-235, Decision 4, Acceptance Criteria 4): the active switch in the run form, under the interactive
 * toggle, labelled with what it sends. It asks the API, not its own copy of the rules (review item 5):
 * `GET /api/site-ownership` gives the gate a run asking for active tests would get for the target, Phase 43's
 * `decideActiveGate`. Open (a local host, or a remote one its valid confirmation covers with the active tick): the
 * switch can be turned on. Closed: it is disabled, with Phase 43's reason as the API gives it, and a link to the site's
 * entry in the site lookup. The run itself still decides at its start (Decision 4), whatever the screen showed.
 */

interface Gate {
    open: boolean;
    closedBy: string | null;
    reason: string | null;
    localHost: boolean;
}

/** A read belongs to the URL it was made for: one for another target counts as still reading (the fresh-context review). */
type Reading = { for: string } & ({ state: "read"; gate: Gate } | { state: "failed"; message: string });

const hostOf = (url: string) => {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
};

export function ActiveSwitch({ baseUrl, enableActive, setEnableActive }: { baseUrl: string; enableActive: boolean; setEnableActive: (value: boolean) => void }) {
    const [reading, setReading] = useState<Reading | null>(null);
    // Read again when the tab comes back, so a confirmation made in the lookup's tab shows here.
    const [reads, setReads] = useState(0);
    const stateId = useId();

    useEffect(() => {
        const again = () => {
            if (document.visibilityState === "visible") setReads((count) => count + 1);
        };
        document.addEventListener("visibilitychange", again);
        window.addEventListener("focus", again);
        return () => {
            document.removeEventListener("visibilitychange", again);
            window.removeEventListener("focus", again);
        };
    }, []);

    useEffect(() => {
        let current = true;
        fetch(`/api/site-ownership?baseUrl=${encodeURIComponent(baseUrl)}`, { cache: "no-store" })
            .then(async (response) => {
                const data = (await response.json().catch(() => null)) as { activeGate?: Gate; error?: string } | null;
                if (!current) return;
                if (!response.ok || !data?.activeGate) {
                    setReading({ for: baseUrl, state: "failed", message: data?.error ?? `the server answered ${response.status}` });
                    return;
                }
                setReading({ for: baseUrl, state: "read", gate: data.activeGate });
            })
            .catch(() => {
                if (current) setReading({ for: baseUrl, state: "failed", message: "Mr Onion didn't answer" });
            });
        return () => {
            current = false;
        };
    }, [baseUrl, reads]);

    const read = reading && reading.for === baseUrl ? reading : null;
    const open = read?.state === "read" && read.gate.open;
    const closed = read?.state === "read" && !read.gate.open;
    // Only a definite answer that the gate is closed turns the switch off: not a read still on its way, nor one that
    // failed, so remounting the section or a dropped re-read keeps the tester's choice (the fresh-context review).
    useEffect(() => {
        if (closed && enableActive) setEnableActive(false);
    }, [closed, enableActive, setEnableActive]);

    const host = hostOf(baseUrl);
    const lookup = `/sites?url=${encodeURIComponent(baseUrl)}`;

    return (
        <div className="mt-3 text-xs text-zinc-400">
            <label className="flex items-start gap-3">
                <input
                    type="checkbox"
                    role="switch"
                    checked={open && enableActive}
                    disabled={!open}
                    aria-describedby={stateId}
                    onChange={(event) => setEnableActive(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-rose-500 disabled:opacity-50"
                />
                <span>
                    Run active tests
                    <span className="block text-zinc-500">Sends attack-shaped input (today: script-shaped input in forms) to the site.</span>
                </span>
            </label>
            <p id={stateId} role="status" data-testid="active-switch-state" className="mt-1 pl-7">
                {!read ? `Checking ${host}'s ownership confirmation...` : null}
                {read?.state === "failed" ? `Not available: ${host}'s ownership confirmation couldn't be checked (${read.message}).` : null}
                {read?.state === "read" && read.gate.open
                    ? read.gate.localHost
                        ? `Available: ${host} is a local host, which needs no ownership confirmation.`
                        : `Available: the site's ownership confirmation covers ${host} and allows active tests.`
                    : null}
                {closed && read?.state === "read" ? `Not available: ${(read.gate.reason ?? "the active gate is closed").replace(/^active test: /, "")}.` : null}
            </p>
            {read && !(read.state === "read" && read.gate.localHost) ? (
                <a href={lookup} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block pl-7 font-medium text-indigo-300 hover:underline">
                    This site&apos;s ownership confirmation (opens in a new tab)
                </a>
            ) : null}
        </div>
    );
}
