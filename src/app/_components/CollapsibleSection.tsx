import { Chevron } from "@/app/_components/Chevron";
import type { ReactNode } from "react";

export function CollapsibleSection({
    title,
    subtitle,
    collapsed,
    onToggle,
    children,
    dark = false,
}: {
    title: string;
    subtitle: string;
    collapsed: boolean;
    onToggle: () => void;
    children: ReactNode;
    dark?: boolean;
}) {
    const sectionId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-panel`;

    return (
        <section className={`rounded-[28px] border p-6 shadow-[0_24px_80px_rgba(15,23,42,0.06)] ${dark
            ? "border-white/70 bg-zinc-950 text-zinc-100 shadow-[0_24px_80px_rgba(15,23,42,0.16)]"
            // TFP-301: no backdrop blur. Under the run overlay it was re-blurred as the page re-rendered with each poll,
            // costing the run about 8 s (measured 2026-11-19); the white over the page's background looks the same.
            : "border-white/70 bg-white/85 text-zinc-900"
            }`}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={!collapsed}
                aria-controls={sectionId}
                className="flex w-full items-start justify-between gap-4 text-left"
            >
                <div>
                    <div className={`text-sm font-semibold uppercase tracking-[0.22em] ${dark ? "text-zinc-500" : "text-indigo-600"}`}>
                        {title}
                    </div>
                    <p className={`mt-2 max-w-3xl text-sm leading-6 ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
                        {subtitle}
                    </p>
                </div>
                <Chevron collapsed={collapsed} dark={dark} />
            </button>
            {!collapsed && <div id={sectionId} className="mt-6">{children}</div>}
        </section>
    );
}

