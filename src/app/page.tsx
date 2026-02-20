"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import CharacterSelect from "@/components/game/CharacterSelect";
import { EntityType } from "@/lib/game/Entities";

// Dynamically import GameCanvas to avoid SSR issues with PixiJS
const GameCanvas = dynamic(() => import("@/components/game/GameCanvas"), {
  ssr: false,
  loading: () => <div className="text-white">Loading Graphics...</div>
});

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);
  const [introFade, setIntroFade] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [p1Type, setP1Type] = useState<EntityType>('SAMURAI');
  const [p2Type, setP2Type] = useState<EntityType>('SAMURAI');

  const [isInputReady, setIsInputReady] = useState(false);

  // Safety Delay: Prevent instant skipping on load (e.g. holding a button)
  useEffect(() => {
    const timer = setTimeout(() => setIsInputReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Intro Input Handler
  useEffect(() => {
    if (!showIntro || !isInputReady) return;

    const handleInput = () => setShowIntro(false);

    // Keyboard
    window.addEventListener('keydown', handleInput);
    window.addEventListener('mousedown', handleInput);

    // Gamepad
    let rafId: number;
    const pollGamepad = () => {
      const gps = navigator.getGamepads();
      for (const gp of gps) {
        // Check for any button press EXCEPT D-Pad (indices 12-15)
        // Standard Mapping: 0-3 (Face), 4-7 (Triggers), 8-9 (Select/Start), 10-11 (Sticks)
        if (gp && gp.buttons.some((b, i) => b.pressed && i < 12)) {
          setShowIntro(false);
          return;
        }
      }
      rafId = requestAnimationFrame(pollGamepad);
    };
    rafId = requestAnimationFrame(pollGamepad);

    return () => {
      window.removeEventListener('keydown', handleInput);
      window.removeEventListener('mousedown', handleInput);
      cancelAnimationFrame(rafId);
    };
  }, [showIntro, isInputReady]);

  const handleStart = (p1: EntityType, p2: EntityType) => {
    setP1Type(p1);
    setP2Type(p2);
    setGameStarted(true);
  };

  // Intro Screen
  if (showIntro) {
    return (
      <main className="w-screen h-screen bg-black overflow-hidden flex flex-col items-center justify-center relative">
        {/* Dramatic visual background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle,_var(--color-primary-dim)_0%,_#000000_70%)] opacity-20 animate-pulse" />

        <div className="text-center z-10 animate-dramatic-zoom px-4">
          <h1 className="text-5xl md:text-8xl font-black italic font-orbitron text-white drop-shadow-[4px_4px_0_rgba(0,255,255,0.8)] tracking-tighter">
            VALORIUM
          </h1>
          <h2 className="text-xl md:text-2xl font-orbitron text-cyan-300 mt-4 tracking-[0.3em] uppercase opacity-90 drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">
            Ascensions of Heroes
          </h2>
        </div>

        <div className={`mt-24 text-3xl md:text-4xl text-white font-black tracking-[0.2em] font-orbitron drop-shadow-[3px_3px_0_rgba(255,0,255,0.8)] transition-opacity duration-500 ${isInputReady ? 'opacity-100 animate-flash-fast' : 'opacity-0'}`}>
          PRESS
        </div>
      </main >
    );
  }

  return (
    <main className="w-screen h-screen bg-background overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--color-surface-light)_0%,_var(--background)_100%)] -z-10" />

      {/* Game Container */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        {!gameStarted ? (
          <CharacterSelect onStart={handleStart} />
        ) : (
          <GameCanvas p1Type={p1Type} p2Type={p2Type} />
        )}
      </div>

      {/* Controls Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-gray-500 text-sm font-mono opacity-75">
        P1: [W A S D] + [SPACE] | P2: [ARROWS] + [ENTER] | HOLD BACK TO BLOCK
      </div>
    </main>
  );
}
