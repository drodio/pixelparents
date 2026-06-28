// Persistence for the super-admin floating profile box's minimized state. A
// single global preference (not per-profile): once minimized, it stays
// minimized across reloads and every profile until restored. localStorage is
// passed in so the logic is testable and SSR-safe (null storage → expanded).

export const ADMIN_BOX_MINIMIZED_KEY = "ff:adminBox:minimized";

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

export function readMinimized(storage: Reader | null | undefined): boolean {
  try {
    return storage?.getItem(ADMIN_BOX_MINIMIZED_KEY) === "1";
  } catch {
    // localStorage can throw in privacy mode / when blocked — default to shown.
    return false;
  }
}

export function writeMinimized(storage: Writer | null | undefined, minimized: boolean): void {
  try {
    storage?.setItem(ADMIN_BOX_MINIMIZED_KEY, minimized ? "1" : "0");
  } catch {
    // Non-fatal: the box just won't remember across reloads in this browser.
  }
}
