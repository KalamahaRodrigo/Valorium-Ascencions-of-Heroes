import { useState, useEffect, useRef } from "react";
import { EntityType } from "@/lib/game/Entities";
import { cn } from "@/lib/utils";

const CHARACTERS: { id: EntityType; name: string; desc: string; color: string }[] = [
    { id: 'SAMURAI', name: 'Ronin', desc: 'Balanced. High Damage.', color: 'bg-cyan-500' },
    { id: 'NINJA', name: 'Kage', desc: 'Fast. Low HP.', color: 'bg-indigo-500' },
    { id: 'MONK', name: 'Zen', desc: 'Tanky. Slow.', color: 'bg-amber-500' },
];

export default function CharacterSelect({ onStart }: { onStart: (p1: EntityType, p2: EntityType) => void }) {
    const [p1Sel, setP1Sel] = useState<number>(0);
    const [p2Sel, setP2Sel] = useState<number>(0);
    const [p1Ready, setP1Ready] = useState(false);
    const [p2Ready, setP2Ready] = useState(false);

    // Keyboard Input
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // P1 Controls
            if (!p1Ready) {
                if (e.key === 'w' || e.key === 'W') setP1Sel(prev => (prev - 1 + CHARACTERS.length) % CHARACTERS.length);
                if (e.key === 's' || e.key === 'S') setP1Sel(prev => (prev + 1) % CHARACTERS.length);
            }
            if (e.code === 'Space') setP1Ready(prev => !prev);

            // P2 Controls
            if (!p2Ready) {
                if (e.key === 'ArrowUp') setP2Sel(prev => (prev - 1 + CHARACTERS.length) % CHARACTERS.length);
                if (e.key === 'ArrowDown') setP2Sel(prev => (prev + 1) % CHARACTERS.length);
            }
            if (e.key === 'Enter') setP2Ready(prev => !prev);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [p1Ready, p2Ready]);

    // Gamepad Input
    const lastButtons = useRef<any>({});
    useEffect(() => {
        let rafId: number;
        const pollGamepads = () => {
            const gamepads = navigator.getGamepads();

            // P1 Gamepad (Index 0)
            if (gamepads[0]) {
                const gp = gamepads[0];
                const now = Date.now();
                // Simple debounce/repeat delay could be implemented, but strict press check is better for menu
                // D-Pad Up (12) / Down (13)
                if (gp.buttons[12].pressed && !lastButtons.current['p1_up']) {
                    if (!p1Ready) setP1Sel(prev => (prev - 1 + CHARACTERS.length) % CHARACTERS.length);
                }
                if (gp.buttons[13].pressed && !lastButtons.current['p1_down']) {
                    if (!p1Ready) setP1Sel(prev => (prev + 1) % CHARACTERS.length);
                }
                // Face Buttons (0, 1, 2, 3) -> Toggle Ready
                if ((gp.buttons[0].pressed || gp.buttons[1].pressed || gp.buttons[2].pressed || gp.buttons[3].pressed) && !lastButtons.current['p1_action']) {
                    setP1Ready(prev => !prev);
                }

                // Retrieve button states for next frame (simple bool latch)
                lastButtons.current['p1_up'] = gp.buttons[12].pressed;
                lastButtons.current['p1_down'] = gp.buttons[13].pressed;
                lastButtons.current['p1_action'] = gp.buttons[0].pressed || gp.buttons[1].pressed || gp.buttons[2].pressed || gp.buttons[3].pressed;
            }

            // P2 Gamepad (Index 1)
            if (gamepads[1]) {
                const gp = gamepads[1];
                if (gp.buttons[12].pressed && !lastButtons.current['p2_up']) {
                    if (!p2Ready) setP2Sel(prev => (prev - 1 + CHARACTERS.length) % CHARACTERS.length);
                }
                if (gp.buttons[13].pressed && !lastButtons.current['p2_down']) {
                    if (!p2Ready) setP2Sel(prev => (prev + 1) % CHARACTERS.length);
                }
                if ((gp.buttons[0].pressed || gp.buttons[1].pressed || gp.buttons[2].pressed || gp.buttons[3].pressed) && !lastButtons.current['p2_action']) {
                    setP2Ready(prev => !prev);
                }

                lastButtons.current['p2_up'] = gp.buttons[12].pressed;
                lastButtons.current['p2_down'] = gp.buttons[13].pressed;
                lastButtons.current['p2_action'] = gp.buttons[0].pressed || gp.buttons[1].pressed || gp.buttons[2].pressed || gp.buttons[3].pressed;
            }

            rafId = requestAnimationFrame(pollGamepads);
        };
        rafId = requestAnimationFrame(pollGamepads);
        return () => cancelAnimationFrame(rafId);
    }, [p1Ready, p2Ready]); // Re-bind when ready state changes to respect scroll lock

    // Auto-Start
    useEffect(() => {
        if (p1Ready && p2Ready) {
            const timer = setTimeout(() => {
                onStart(CHARACTERS[p1Sel].id, CHARACTERS[p2Sel].id);
            }, 1000); // 1s delay to see "READY" status
            return () => clearTimeout(timer);
        }
    }, [p1Ready, p2Ready, p1Sel, p2Sel, onStart]);

    return (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-white font-orbitron">
            <h1 className="text-4xl text-primary mb-12 uppercase tracking-widest text-glow animate-pulse">Choose Your Fighter</h1>

            <div className="flex w-full max-w-5xl justify-between px-12">
                {/* P1 Selection */}
                <div className="flex flex-col gap-4 items-center">
                    <h2 className="text-2xl text-cyan-400">PLAYER 1</h2>
                    <div className="text-xs text-gray-500 mb-2">[W/S] Select . [SPACE] Confirm</div>
                    <div className="flex flex-col gap-2">
                        {CHARACTERS.map((c, i) => (
                            <button
                                key={c.id}
                                onClick={() => { setP1Sel(i); setP1Ready(true); }} // Click confirms
                                className={cn(
                                    "p-4 border-2 w-72 text-left transition-all relative overflow-hidden",
                                    p1Sel === i ? "border-cyan-500 bg-cyan-950/50" : "border-gray-800 text-gray-600 bg-gray-950",
                                    p1Ready && p1Sel === i && "bg-cyan-600 border-white ring-4 ring-cyan-400/50"
                                )}
                            >
                                <div className="flex justify-between items-center relative z-10">
                                    <span className="font-bold text-xl">{c.name}</span>
                                    {p1Ready && p1Sel === i && <span className="text-white font-black animate-pulse">READY</span>}
                                </div>
                                <div className="text-xs opacity-70 relative z-10">{c.desc}</div>
                                {/* Selection Highlight Bar */}
                                {p1Sel === i && !p1Ready && (
                                    <div className="absolute inset-0 bg-white/5 animate-pulse" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* VS Divider */}
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="text-8xl font-black italic text-gray-800 select-none">VS</div>
                    {(p1Ready && p2Ready) && (
                        <div className="text-red-500 font-bold text-2xl animate-shake">FIGHT!</div>
                    )}
                </div>

                {/* P2 Selection */}
                <div className="flex flex-col gap-4 items-center">
                    <h2 className="text-2xl text-purple-400">PLAYER 2</h2>
                    <div className="text-xs text-gray-500 mb-2">[ARROWS] Select . [ENTER] Confirm</div>
                    <div className="flex flex-col gap-2">
                        {CHARACTERS.map((c, i) => (
                            <button
                                key={c.id}
                                onClick={() => { setP2Sel(i); setP2Ready(true); }} // Click confirms
                                className={cn(
                                    "p-4 border-2 w-72 text-right transition-all relative overflow-hidden",
                                    p2Sel === i ? "border-purple-500 bg-purple-950/50" : "border-gray-800 text-gray-600 bg-gray-950",
                                    p2Ready && p2Sel === i && "bg-purple-600 border-white ring-4 ring-purple-400/50"
                                )}
                            >
                                <div className="flex justify-between items-center flex-row-reverse relative z-10">
                                    <span className="font-bold text-xl">{c.name}</span>
                                    {p2Ready && p2Sel === i && <span className="text-white font-black animate-pulse">READY</span>}
                                </div>
                                <div className="text-xs opacity-70 relative z-10">{c.desc}</div>
                                {/* Selection Highlight Bar */}
                                {p2Sel === i && !p2Ready && (
                                    <div className="absolute inset-0 bg-white/5 animate-pulse" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
