export const metadata = { title: "Trigger error — preview", robots: { index: false } };

// Throws during render so you can see the REAL app/error.tsx boundary catch it
// end-to-end (including the Try-again reset()).
export default function ThrowPreview() {
  throw new Error("Preview: intentional error to demo the error boundary.");
}
