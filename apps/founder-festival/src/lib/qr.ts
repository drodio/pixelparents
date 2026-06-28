import QRCode from "qrcode";

// Render a QR code as a self-contained SVG string (server-side). Used by the
// event-badge print route to embed a scannable link to each attendee's profile.
// margin:0 keeps the quiet zone tight (we add padding in CSS); errorCorrection
// "M" survives the small print size on the 62mm label well enough.
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}
