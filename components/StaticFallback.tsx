"use client";

import { useState } from "react";

// The page never shows an error message. It degrades into something that is
// still worth looking at: the same frame, rendered by the server.
export default function StaticFallback({ reason }: { reason: "no-webgpu" | "device-lost" }) {
  // If the render endpoint is down too, the browser's broken-image glyph is the
  // last thing this page should show — and the visitor most likely to see it is
  // the one already without WebGPU. Drop the image and keep the note, which
  // still explains where the picture was meant to come from.
  const [broken, setBroken] = useState(false);

  return (
    <div className="fallback">
      {!broken && (
        <img
          src="/api/mint?spin=0&melt=0&w=1600&h=900"
          alt="The minted coin, rendered on the server."
          onError={() => setBroken(true)}
        />
      )}
      <p className="fallback-note">
        {reason === "no-webgpu"
          ? "This browser does not draw on the GPU, so the server made this image — with the same shader."
          : "The live drawing stopped. The server made this image, with the same shader."}
      </p>
    </div>
  );
}
