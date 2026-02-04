"use client";

import { useEffect, useRef, useState } from "react";
import { GameEngine, GameState } from "@/lib/game/GameEngine";
import { EntityType, Lane, Player, Titan } from "@/lib/game/Entities";
import { cn } from "@/lib/utils";

// --- Visual Constants ---
const COLORS = {
    bg: "#050510",
    grid: "#ff00ff",
    sun: "#ff00cc",
    p1: "#00ffff", // Cyan
    p2: "#d000ff", // Purple
    text: "#ffffff"
};

export default function GameCanvas({ p1Type, p2Type }: { p1Type: EntityType, p2Type: EntityType }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<GameEngine | null>(null);
    const inputRef = useRef<Set<string>>(new Set());
    const requestRef = useRef<number>(0);
    const [gameState, setGameState] = useState<GameState | null>(null);

    // Initialize Game Engine
    useEffect(() => {
        engineRef.current = new GameEngine(p1Type, p2Type);
        setGameState({ ...engineRef.current.state });

        const handleKeyDown = (e: KeyboardEvent) => inputRef.current.add(e.code);
        const handleKeyUp = (e: KeyboardEvent) => inputRef.current.delete(e.code);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [p1Type, p2Type]);

    // Game Loop & Rendering (Robust Init)
    useEffect(() => {
        let animationFrameId: number;
        let isRunning = true;

        const initGameLoop = () => {
            const canvas = canvasRef.current;
            if (!canvas) {
                // If canvas not ready, retry in next frame
                if (isRunning) requestAnimationFrame(initGameLoop);
                return;
            }

            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) return;

            console.log("Canvas Found. Starting Loop.");
            let lastTime = performance.now();

            const render = (time: number) => {
                if (!isRunning) return;

                const dt = (time - lastTime) / 1000;
                lastTime = time;

                if (engineRef.current) {
                    engineRef.current.update(dt, inputRef.current);

                    if (requestRef.current++ % 10 === 0) {
                        setGameState({ ...engineRef.current.state });
                    }
                    drawScene(ctx, engineRef.current);
                }

                animationFrameId = requestAnimationFrame(render);
            };

            animationFrameId = requestAnimationFrame(render);
        };

        // Start initialization attempt
        initGameLoop();

        return () => {
            console.log("Stopping Loop cleanup");
            isRunning = false;
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    // --- Rendering Logic ---
    const drawScene = (ctx: CanvasRenderingContext2D, engine: GameEngine) => {
        const { width, height } = ctx.canvas;
        const state = engine.state;

        // A. Clear & Background (Simple)
        ctx.fillStyle = "#1a1a2e"; // Simple Dark Blue
        ctx.fillRect(0, 0, width, height);

        // Floor / Ground Line
        ctx.fillStyle = "#333";
        ctx.fillRect(0, 150, width, 30); // FG Ground
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 100, width, 40); // BG Ground

        // C. Entities
        const drawEntity = (e: any, isFG: boolean) => {
            if (e.isDead) return;

            // Positioning logic used in engine
            ctx.save();
            
            // Simple Shadow
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath();
            ctx.ellipse(e.x + e.width/2, e.y + e.height, e.width/2, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            // Body Rect
            ctx.fillStyle = e.color;
            if (!isFG) ctx.globalAlpha = 0.6; // Dim BG
            ctx.fillRect(e.x, e.y, e.width, e.height);
            
            // Titan Details (Simple Box)
            if (e.width > 30) {
                 ctx.fillStyle = "rgba(0,0,0,0.3)";
                 ctx.fillRect(e.x + 5, e.y + 5, e.width - 10, 10); // Visor
            }

            // Weapon / Action
            ctx.globalAlpha = 1.0;

            if (e.isBlocking) {
                ctx.fillStyle = "#4444ff";
                const shieldX = e.facingRight ? e.x + e.width : e.x - 5;
                ctx.fillRect(shieldX, e.y, 5, e.height);
            }

            if (e.isAttacking) {
                ctx.fillStyle = "#ffffff";
                const dir = e.facingRight ? 1 : -1;
                const swordX = e.facingRight ? e.x + e.width : e.x;
                ctx.fillRect(swordX, e.y + 15, 30 * dir, 4);
            }

            // Special Move: Simple Ring (No Glows)
            if (e.isUsingSpecial) {
                ctx.strokeStyle = e.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(e.x + e.width/2, e.y + e.height/2, 60, 0, Math.PI * 2);
                ctx.stroke();
            }

            // HP Bar (Overhead)
            const hpPct = Math.max(0, e.health / e.maxHealth);
            ctx.fillStyle = "#550000";
            ctx.fillRect(e.x, e.y - 8, e.width, 4);
            ctx.fillStyle = "#00ff00";
            ctx.fillRect(e.x, e.y - 8, e.width * hpPct, 4);

            ctx.restore();
        };

        // Render Order: BG Lane -> FG Lane
        const ent = [state.player1, state.player2, state.titan1, state.titan2];
        const bgEnts = ent.filter(e => e.lane === 'BACKGROUND');
        const fgEnts = ent.filter(e => e.lane === 'FOREGROUND');

        bgEnts.forEach(e => drawEntity(e, false));
        fgEnts.forEach(e => drawEntity(e, true));
    };


    if (!gameState) return <div className="text-white text-center mt-20">Initializing System...</div>;

    return (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
            <div className="w-full h-full border-2 border-slate-800 shadow-2xl bg-gray-900 rounded-lg overflow-hidden relative flex items-center justify-center">
                <canvas
                    ref={canvasRef}
                    width={320}
                    height={180}
                    className="w-full h-full [image-rendering:pixelated]"
                />
            </div>

            {/* HUD Overlay */}
            <HUD state={gameState} />
        </div>
    );
}

// ... HUD and HealthBar components ...
function HUD({ state }: { state: GameState }) {
    if (state.winner) {
        return (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 pointer-events-none">
                <div className="text-6xl font-orbitron text-primary animate-pulse">
                    PLAYER {state.winner} WINS!
                </div>
            </div>
        );
    }

    return (
        <div className="absolute top-0 left-0 w-full p-4 flex flex-col pointer-events-none">
            {/* TIMER */}
            <div className="w-full flex justify-center mb-2">
                <div className="text-4xl text-yellow-400 font-bold font-mono bg-black/50 px-4 rounded border border-yellow-600">
                    {Math.ceil(state.timer)}
                </div>
            </div>

            <div className="flex justify-between w-full text-white font-orbitron">
                {/* Player 1 Stats */}
                <div className="flex flex-col gap-2 w-1/3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-cyan-500 rounded-full box-glow" />
                        <span className="text-xl">P1 (YOU)</span>
                    </div>
                    <HealthBar current={state.player1.health} max={state.player1.maxHealth} color="bg-cyan-500" />
                    <img src="https://i.imgur.com/placehold.png" alt="" className="hidden" />
                    {/* Special Bar P1 */}
                    <div className="w-full h-2 bg-gray-900 mt-1 border border-cyan-900">
                        <div className="h-full bg-yellow-400 transition-all duration-75" style={{ width: `${(state.player1 as any).specialMeter}%` }} />
                    </div>
                </div>

                {/* Player 2 Stats */}
                <div className="flex flex-col gap-2 items-end w-1/3">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">P2 (ENEMY)</span>
                        <div className="w-8 h-8 bg-purple-500 rounded-full box-glow" />
                    </div>
                    <HealthBar current={state.player2.health} max={state.player2.maxHealth} color="bg-purple-500" />
                    {/* Special Bar P2 */}
                    <div className="w-full h-2 bg-gray-900 mt-1 border border-purple-900">
                        <div className="h-full bg-yellow-400 transition-all duration-75" style={{ width: `${(state.player2 as any).specialMeter}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function HealthBar({ current, max, color }: { current: number, max: number, color: string }) {
    const pct = Math.max(0, (current / max) * 100);
    return (
        <div className="w-full h-4 bg-gray-800 border border-gray-600 skew-x-[-15deg] overflow-hidden">
            <div
                className={cn("h-full transition-all duration-200", color)}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}
