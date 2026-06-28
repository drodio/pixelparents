"use client";

import { useEffect, useRef, useState } from "react";

// Auto-submits the approve/deny decision as soon as the page loads, so the
// recipient who clicked the email button lands straight on the result — no second
// click. This stays safe against email scanners / link prefetchers because they
// only issue GET requests and do NOT run JavaScript; the decision is a
// JS-triggered POST, so a scanner's GET never fires it. The decide endpoint only
// acts on still-pending requests (idempotent), so a refresh/retry is harmless.
export function ConnectionRespond({ token, action }: { token: string; action: "approved" | "denied" }) {
  const [state, setState] = useState<"busy" | "done" | "handled" | "error">("busy");
  const [msg, setMsg] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return; // guard React's double-invoke / re-renders
    fired.current = true;
    (async () => {
      try {
        const res = await fetch("/api/connections/respond", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, decision: action }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) setState("done");
        else if (res.status === 404) setState("handled"); // already handled / stale link
        else {
          setState("error");
          setMsg(data?.error ?? "Something went wrong.");
        }
      } catch {
        setState("error");
        setMsg("Network error — please try again.");
      }
    })();
  }, [token, action]);

  if (state === "busy") {
    return <p className="text-zinc-400">{action === "approved" ? "Approving…" : "Submitting…"}</p>;
  }
  if (state === "done") {
    return (
      <p className="text-zinc-200">
        {action === "approved"
          ? "Approved — we've emailed an intro to you both."
          : "Denied — no contact info was shared."}
      </p>
    );
  }
  if (state === "handled") {
    return <p className="text-zinc-400">This request was already handled.</p>;
  }
  return <p className="text-red-400">{msg}</p>;
}
