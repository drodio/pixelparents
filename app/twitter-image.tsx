// Twitter card = the same DYNAMIC card as the Open Graph image. Re-export the
// opengraph-image route so both stay in sync and there is a single source of
// truth for the design + the live family count.
export { runtime, dynamic, revalidate, alt, size, contentType, default } from "./opengraph-image";
