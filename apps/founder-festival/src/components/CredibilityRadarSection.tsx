"use client";

import { useState } from "react";
import { CredibilityRadar } from "./CredibilityRadar";
import type { RadarVector } from "@/lib/credibility";

type Dim = "founder" | "investor";

// Wraps the radar with a Founder/Investor toggle. Shows the dominant dimension
// (higher score) by default — same convention as the profile's headline score —
// and only renders the toggle when the person scored on BOTH.
export function CredibilityRadarSection({
  founder,
  investor,
  defaultDimension,
}: {
  founder: RadarVector[] | null;
  investor: RadarVector[] | null;
  defaultDimension: Dim;
}) {
  const both = !!founder && !!investor;
  const [dim, setDim] = useState<Dim>(defaultDimension);

  const vectors = (dim === "investor" ? investor : founder) ?? founder ?? investor;
  if (!vectors) return null;
  const peerLabel = (both ? dim : founder ? "founder" : "investor") as string;

  return (
    <div className="flex flex-col gap-3">
      {both && (
        <div className="inline-flex self-start rounded-md border border-zinc-800 p-0.5 text-sm">
          {(["founder", "investor"] as Dim[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDim(d)}
              className={`rounded-md px-3 py-1 capitalize cursor-pointer transition-colors ${
                dim === d ? "bg-[#dfa43a]/15 text-[#dfa43a]" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      <CredibilityRadar vectors={vectors} peerLabel={peerLabel} />
    </div>
  );
}
