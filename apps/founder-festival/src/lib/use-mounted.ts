import { useSyncExternalStore } from "react";

// Returns false during SSR / first render, true once mounted on the client —
// without a setState-in-effect (which the react-hooks lint flags). Use to guard
// createPortal(..., document.body), which needs a real DOM. Same useSyncExternalStore
// approach as AdminProfileBox's localStorage read.
const noopSubscribe = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true, // client snapshot
    () => false, // server snapshot
  );
}
