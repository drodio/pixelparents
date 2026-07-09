import Image from "next/image";
import Link from "next/link";

// The GoPixel mascot with its standard treatment: a 3px border in the
// regular text gray, with a 2px transparent gap between the image and the border.
export function PixelMascot({
  widthClass = "w-24",
  href,
  priority = true,
}: {
  widthClass?: string;
  href?: string;
  priority?: boolean;
}) {
  const framed = (
    <span className="inline-block rounded-2xl border-[3px] border-white/60 p-[2px]">
      <Image
        src="/images/pixel-mascot.png"
        alt="GoPixel mascot"
        width={934}
        height={918}
        priority={priority}
        className={`h-auto rounded-xl ${widthClass}`}
      />
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label="GoPixel home"
        className="inline-block transition-opacity hover:opacity-80"
      >
        {framed}
      </Link>
    );
  }
  return framed;
}
