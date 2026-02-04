"use client";

import { useState } from "react";
import { EntityType } from "@/lib/game/Entities";
import { cn } from "@/lib/utils";

const CHARACTERS: { id: EntityType; name: string; desc: string; color: string }[] = [
    { id: 'SAMURAI', name: 'Ronin', desc: 'Balanced. High Damage.', color: 'bg-cyan-500' },
    { id: 'NINJA', name: 'Kage', desc: 'Fast. Low HP.', color: 'bg-indigo-500' },
    { id: 'MONK', name: 'Zen', desc: 'Tanky. Slow.', color: 'bg-amber-500' },
];

export default function CharacterSelect({ onStart }: { onStart: (p1: EntityType, p2: EntityType) => void }) {
    const [p1Sel, setP1Sel] = useState<EntityType>('SAMURAI');
    const [p2Sel, setP2Sel] = useState<EntityType>('SAMURAI');

    return (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-white font-orbitron">
            <h1 className="text-4xl text-primary mb-12 uppercase tracking-widest text-glow">Choose Your Fighter</h1>

            <div className="flex w-full max-w-4xl justify-between px-12">
                {/* P1 Selection */}
                <div className="flex flex-col gap-4 items-center">
                    <h2 className="text-2xl text-cyan-400">PLAYER 1</h2>
                    <div className="flex flex-col gap-2">
                        {CHARACTERS.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setP1Sel(c.id)}
                                className={cn(
                                    "p-4 border-2 w-64 text-left transition-all hover:bg-white/10",
                                    p1Sel === c.id ? "border-cyan-500 bg-cyan-950" : "border-gray-700 text-gray-500"
                                )}
                            >
                                <div className="font-bold text-lg">{c.name}</div>
                                <div className="text-xs opacity-70">{c.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* VS Divider */}
                <div className="flex items-center text-6xl font-black italic text-gray-800">VS</div>

                {/* P2 Selection */}
                <div className="flex flex-col gap-4 items-center">
                    <h2 className="text-2xl text-purple-400">PLAYER 2</h2>
                    <div className="flex flex-col gap-2">
                        {CHARACTERS.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setP2Sel(c.id)}
                                className={cn(
                                    "p-4 border-2 w-64 text-right transition-all hover:bg-white/10",
                                    p2Sel === c.id ? "border-purple-500 bg-purple-950" : "border-gray-700 text-gray-500"
                                )}
                            >
                                <div className="font-bold text-lg">{c.name}</div>
                                <div className="text-xs opacity-70">{c.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <button
                onClick={() => onStart(p1Sel, p2Sel)}
                className="mt-16 px-12 py-4 bg-red-600 text-white text-2xl font-bold rounded hover:bg-red-500 animate-pulse"
            >
                FIGHT!
            </button>
        </div>
    );
}
