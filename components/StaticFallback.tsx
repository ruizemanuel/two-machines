// The page never shows an error message. It degrades into something that is
// still worth looking at: the same frame, rendered by the server.
export default function StaticFallback({ reason }: { reason: "no-webgpu" | "device-lost" }) {
  return (
    <div className="fallback">
      <img src="/api/mint?spin=0&melt=0&w=1600&h=900" alt="La moneda acuñada, renderizada en el servidor." />
      <p className="fallback-note">
        {reason === "no-webgpu"
          ? "Este navegador no dibuja en la GPU, así que esta imagen la ha hecho el servidor — con el mismo shader."
          : "El dibujo en vivo se ha detenido. Esta imagen la ha hecho el servidor, con el mismo shader."}
      </p>
    </div>
  );
}
