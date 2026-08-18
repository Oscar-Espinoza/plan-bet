import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#10161e",
        color: "#61d095",
        border: "4px solid #61d095",
        fontSize: 25,
        fontWeight: 800,
      }}
    >
      MP
    </div>,
    size,
  );
}
