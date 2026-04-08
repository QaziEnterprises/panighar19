import { useEffect, useRef, useState } from "react";
import { getAppSettings } from "@/hooks/useAppSettings";

type CursorStyle = "neon-glow" | "simple-dot" | "crosshair" | "ring" | "none";

function getCursorStyle(): CursorStyle {
  try {
    const raw = localStorage.getItem("app_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return (parsed.cursorStyle as CursorStyle) || "neon-glow";
    }
  } catch {}
  return "neon-glow";
}

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<HTMLDivElement[]>([]);
  const [clicking, setClicking] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [cursorStyle, setCursorStyle] = useState<CursorStyle>(getCursorStyle);
  const pos = useRef({ x: -100, y: -100 });
  const trailPositions = useRef(Array.from({ length: 6 }, () => ({ x: -100, y: -100 })));

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "app_settings") setCursorStyle(getCursorStyle());
    };
    window.addEventListener("storage", handler);
    
    const interval = setInterval(() => setCursorStyle(getCursorStyle()), 1000);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (cursorStyle === "none") {
      document.documentElement.classList.add("system-cursor");
      return () => { document.documentElement.classList.remove("system-cursor"); };
    } else {
      document.documentElement.classList.remove("system-cursor");
    }

    const onMove = (e: MouseEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      }
    };

    let raf: number;
    const animate = () => {
      // Update trail positions with easing
      for (let i = 0; i < trailPositions.current.length; i++) {
        const target = i === 0 ? pos.current : trailPositions.current[i - 1];
        const speed = 0.2 - i * 0.025;
        trailPositions.current[i].x += (target.x - trailPositions.current[i].x) * speed;
        trailPositions.current[i].y += (target.y - trailPositions.current[i].y) * speed;
        
        const ref = trailRefs.current[i];
        if (ref) {
          const scale = clicking ? 0.5 : hovering ? 1.3 : 1;
          const opacity = (1 - i / trailPositions.current.length) * (clicking ? 0.8 : hovering ? 0.6 : 0.4);
          ref.style.transform = `translate(${trailPositions.current[i].x}px, ${trailPositions.current[i].y}px) translate(-50%, -50%) scale(${scale})`;
          ref.style.opacity = `${opacity}`;
        }
      }
      raf = requestAnimationFrame(animate);
    };

    const onDown = () => setClicking(true);
    const onUp = () => setClicking(false);
    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button, [role='button'], input, textarea, select, label, [data-clickable]")) {
        setHovering(true);
      }
    };
    const onOut = () => setHovering(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mouseover", onOver);
    window.addEventListener("mouseout", onOut);
    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mouseover", onOver);
      window.removeEventListener("mouseout", onOut);
      cancelAnimationFrame(raf);
    };
  }, [clicking, hovering, cursorStyle]);

  const isTouchDevice = typeof window !== "undefined" && "ontouchstart" in window;
  if (isTouchDevice || cursorStyle === "none") return null;

  if (cursorStyle === "simple-dot") {
    return (
      <div
        ref={dotRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999] rounded-full"
        style={{
          width: clicking ? 6 : hovering ? 14 : 10,
          height: clicking ? 6 : hovering ? 14 : 10,
          backgroundColor: "hsl(var(--accent))",
          transition: "width 0.15s, height 0.15s",
          boxShadow: "0 0 6px hsl(var(--accent) / 0.5)",
        }}
      />
    );
  }

  if (cursorStyle === "crosshair") {
    return (
      <div
        ref={dotRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999]"
        style={{
          width: hovering ? 28 : 22,
          height: hovering ? 28 : 22,
          transition: "width 0.2s, height 0.2s",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-full rounded-full" style={{ backgroundColor: "hsl(var(--accent))", boxShadow: "0 0 6px hsl(var(--accent) / 0.6)" }} />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] w-full rounded-full" style={{ backgroundColor: "hsl(var(--accent))", boxShadow: "0 0 6px hsl(var(--accent) / 0.6)" }} />
      </div>
    );
  }

  if (cursorStyle === "ring") {
    return (
      <>
        <div
          ref={dotRef}
          className="pointer-events-none fixed top-0 left-0 z-[9999] rounded-full"
          style={{
            width: 8,
            height: 8,
            backgroundColor: "hsl(var(--accent))",
            boxShadow: "0 0 8px hsl(var(--accent) / 0.6)",
          }}
        />
        <div
          ref={(el) => { if (el) trailRefs.current[0] = el; }}
          className="pointer-events-none fixed top-0 left-0 z-[9998] rounded-full border-2"
          style={{
            width: hovering ? 48 : 36,
            height: hovering ? 48 : 36,
            borderColor: `hsl(var(--accent) / ${hovering ? 0.8 : 0.4})`,
            transition: "width 0.3s, height 0.3s, border-color 0.3s",
          }}
        />
      </>
    );
  }

  // Default: neon-glow
  return (
    <>
      {/* Neon dot */}
      <div
        ref={dotRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999] rounded-full"
        style={{
          width: clicking ? 6 : hovering ? 14 : 10,
          height: clicking ? 6 : hovering ? 14 : 10,
          backgroundColor: "hsl(var(--accent))",
          boxShadow: `0 0 ${clicking ? 16 : hovering ? 24 : 12}px hsl(var(--accent) / 0.8), 0 0 ${clicking ? 30 : hovering ? 40 : 20}px hsl(var(--accent) / 0.4), 0 0 ${clicking ? 50 : hovering ? 60 : 35}px hsl(var(--accent) / 0.2)`,
          transition: "width 0.15s, height 0.15s, box-shadow 0.2s",
        }}
      />
      {/* Trail particles */}
      {trailPositions.current.map((_, i) => (
        <div
          key={i}
          ref={(el) => { if (el) trailRefs.current[i] = el; }}
          className="pointer-events-none fixed top-0 left-0 z-[9998] rounded-full"
          style={{
            width: 6 - i * 0.6,
            height: 6 - i * 0.6,
            backgroundColor: "hsl(var(--accent))",
            boxShadow: `0 0 ${8 - i}px hsl(var(--accent) / ${0.6 - i * 0.08})`,
            opacity: 0,
          }}
        />
      ))}
    </>
  );
}
