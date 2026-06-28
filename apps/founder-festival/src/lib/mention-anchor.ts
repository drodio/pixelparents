// Pure, DOM/DB-free builder for the anchor a profile-mention serializes to.
// Shared by the TipTap mention node's renderHTML so the exact output is
// unit-tested without a DOM. The published recap styles all anchors gold, so
// this renders as a clickable gold link to the profile.
export type MentionAttrs = { id: string | null; label: string | null; href: string | null };

// ProseMirror DOMOutputSpec: ["a", attrs, textContent]. Null id/href are omitted
// so a malformed mention degrades to a plain (non-link) span of text.
export function mentionAnchorSpec(attrs: MentionAttrs): ["a", Record<string, string>, string] {
  const a: Record<string, string> = { class: "mention" };
  if (attrs.id) a["data-mention-id"] = attrs.id;
  if (attrs.href) a["href"] = attrs.href;
  return ["a", a, attrs.label ?? ""];
}
