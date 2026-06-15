import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-black px-6 text-center">
      <Image
        src="/images/pixel-mascot.png"
        alt="Pixel Parents mascot"
        width={934}
        height={918}
        priority
        className="h-auto w-64 max-w-[80vw] sm:w-80"
      />
      <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Hello, world
      </h1>
      <p className="text-base text-white/60">Pixel Parents — coming soon.</p>
    </main>
  );
}
