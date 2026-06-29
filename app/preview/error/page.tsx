import { ErrorScreen } from "@/components/screens/error-screen";

export const metadata = { title: "Error — preview", robots: { index: false } };

// Renders the error design directly (no boundary). "Try again" reloads, since
// there's no reset() to call outside a real error boundary.
export default function ErrorPreview() {
  return <ErrorScreen />;
}
