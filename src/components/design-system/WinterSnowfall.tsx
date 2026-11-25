"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./winter-snowfall.module.css";

/** Deterministic CSS particles: no random hydration values, canvas or animation-frame loop. */
export function WinterSnowfall() {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scene.current || !("IntersectionObserver" in window)) return;
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); });
    observer.observe(scene.current);
    document.addEventListener("visibilitychange", update);
    update();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div ref={scene} className={styles.scene} data-paused={paused || !visible} data-winter-snowfall>
    <div className={styles.flakes} aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => <span key={i} className={styles.lane} style={{
        left: `${(i * 37 + 9) % 101}%`, width: `${i % 4 === 0 ? 17 : 4 + i % 7}px`,
        opacity: i % 4 === 0 ? .65 : .3 + i % 3 * .15,
        animationDuration: `${12 + i % 8 * 2}s`, animationDelay: `${-(i * 7.3 % 26)}s`,
        "--drift": `${i % 2 ? 28 : -22}px`,
      } as CSSProperties}>
        {i % 4 === 0 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"><path d="M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7M9 4l3 3 3-3M9 20l3-3 3 3M3.57 10.6l4.1-1.1-1.1-4.1M17.43 18.6l-1.1-4.1 4.1-1.1M6.57 18.6l1.1-4.1-4.1-1.1M20.43 10.6l-4.1-1.1 1.1-4.1" /></svg> : <span className={styles.dot} />}
      </span>)}
    </div>
    <button type="button" className={styles.pause} onClick={() => setPaused(!paused)} aria-label={paused ? "Resume snowfall" : "Pause snowfall"}>
      {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
      <span>{paused ? "Resume snow" : "Pause snow"}</span>
    </button>
  </div>;
}
