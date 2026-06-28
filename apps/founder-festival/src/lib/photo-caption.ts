import { generateText } from "ai";

// Vision model used to auto-caption event photos. Sonnet sees the image; Haiku
// would be cheaper but captions are noticeably better with a stronger model and
// we only run this on demand (admin/attendee click), not in any hot path.
const MODEL = "anthropic/claude-sonnet-4-6";

// Strip HTML tags + collapse whitespace so the learnings/description we feed the
// model as context stay short and plain.
function plain(html: string | null | undefined, max = 800): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type CaptionContext = {
  blobUrl: string;
  eventTitle: string;
  description?: string | null;
  learnings?: string | null;
};

// Generate a single short caption for one photo, using the event's title +
// description + learnings as grounding context. Returns a trimmed one-liner, or
// "" if the model declines / errors (callers leave the caption untouched on "").
export async function generatePhotoCaption(ctx: CaptionContext): Promise<string> {
  const context = [
    `Event: ${ctx.eventTitle}`,
    ctx.description ? `About: ${plain(ctx.description)}` : "",
    ctx.learnings ? `Learnings: ${plain(ctx.learnings)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const instructions = `Write a single short caption (max ~12 words) for this photo from the event below. Be concrete and specific to what's visible in the image; use the event context only to ground names/themes, not to invent details you can't see. No quotes, no hashtags, no trailing period. If the image is unreadable, reply with an empty line.

${context}`;

  try {
    const gen = await generateText({
      model: MODEL,
      temperature: 0.4,
      maxOutputTokens: 64,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instructions },
            { type: "image", image: new URL(ctx.blobUrl) },
          ],
        },
      ],
    });
    return gen.text.trim().replace(/^["']|["']$/g, "").replace(/\.$/, "").trim();
  } catch (err) {
    console.error("[photo-caption] generate failed:", err);
    return "";
  }
}
