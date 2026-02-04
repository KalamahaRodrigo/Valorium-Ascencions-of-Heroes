"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import CharacterSelect from "@/components/game/CharacterSelect";
import { EntityType } from "@/lib/game/Entities";

// Dynamically import GameCanvas to avoid SSR issues with PixiJS
const GameCanvas = dynamic(() => import("@/components/game/GameCanvas"), {
  ssr: false,
  loading: () => <div className="text-white">Loading Graphics...</div>
});

export default function Home() {
  const [gameStarted, setGameStarted] = useState(false);
  const [p1Type, setP1Type] = useState<EntityType>('SAMURAI');
  const [p2Type, setP2Type] = useState<EntityType>('SAMURAI');

  const handleStart = (p1: EntityType, p2: EntityType) => {
    setP1Type(p1);
    setP2Type(p2);
    setGameStarted(true);
  };

  return (
    <main className="w-screen h-screen bg-background overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--color-surface-light)_0%,_var(--background)_100%)] -z-10" />

      {/* Header */}
      <h1 className="absolute top-4 left-1/2 -translate-x-1/2 text-3xl md:text-5xl font-orbitron text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 z-10 opacity-50">
        VALORIUM: SHODOWN
      </h1>

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
