import { useEffect, useRef, useState } from "react";

/** Detects if a MediaStream's audio is above a speaking threshold. */
export function useSpeaking(stream: MediaStream | null) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return;
    }
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let last = 0;
    const iv = setInterval(() => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (rms > 0.04) {
        last = now;
        setSpeaking(true);
      } else if (now - last > 350) setSpeaking(false);
    }, 100);
    return () => {
      clearInterval(iv);
      src.disconnect();
      ctx.close().catch(() => {});
    };
  }, [stream]);
  return speaking;
}

/** Avatar that freezes animated GIFs unless the person is speaking. */
export function Avatar({
  url,
  name,
  speaking = false,
  size = 36,
  color,
}: {
  url?: string | null | undefined;
  name: string;
  speaking?: boolean | undefined;
  size?: number | undefined;
  color?: string | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    setFrozen(false);
    if (!url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      try {
        c.getContext("2d")?.drawImage(img, 0, 0);
        setFrozen(true);
      } catch {
        /* ignore */
      }
    };
    img.src = url;
  }, [url]);

  const showStill = !!url && frozen && !speaking;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-secondary transition-shadow duration-150 ${speaking ? "speaking-ring" : ""}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <>
          <img src={url} alt={name} className={`h-full w-full object-cover ${showStill ? "invisible" : ""}`} />
          <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full object-cover ${showStill ? "" : "invisible"}`} />
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center font-display font-bold"
          style={{ color, fontSize: size * 0.42 }}
        >
          {name[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}
