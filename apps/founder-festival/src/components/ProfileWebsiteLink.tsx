import { FiGlobe } from "react-icons/fi";

// A clickable globe icon linking to the subject's self-entered personal website.
// Mirrors the LinkedIn icon treatment on the profile heading (muted → accent on
// hover). `size` matches the two heading variants: "lg" sits next to the welcome
// line, "sm" next to the full-name subtitle.
export function ProfileWebsiteLink({
  url,
  name,
  size = "lg",
}: {
  url: string;
  name: string | null;
  size?: "lg" | "sm";
}) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw url as the label */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={name ? `${name}'s website (${host})` : `Website (${host})`}
      title={host}
      className="text-zinc-500 hover:text-[#D4A24A] transition-colors"
    >
      <FiGlobe className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
    </a>
  );
}
