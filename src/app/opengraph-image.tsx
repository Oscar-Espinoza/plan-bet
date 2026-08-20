import { ImageResponse } from "next/og";

export const alt = "Matchday Plan sports preparation workspace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#090d12",
        color: "#f0f2ee",
        padding: "70px",
        border: "1px solid #26313d",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "22px",
          fontSize: 28,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 64,
            height: 64,
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #61d095",
            color: "#61d095",
            fontWeight: 800,
          }}
        >
          MP
        </div>
        Matchday Plan
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            color: "#61d095",
            fontSize: 22,
            letterSpacing: 5,
            textTransform: "uppercase",
          }}
        >
          Game prep desk
        </div>
        <div
          style={{
            maxWidth: 900,
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 0.96,
            textTransform: "uppercase",
          }}
        >
          Know what matters before the first whistle.
        </div>
      </div>
      <div style={{ display: "flex", color: "#98a4b2", fontSize: 22 }}>
        Soccer · Baseball · Cited briefings from saved evidence
      </div>
    </div>,
    size,
  );
}
