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

        // A. Clear & Background
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, width, height);

        // B. Retro Grid (Synthwave)
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255, 0, 255, 0.2)";
        ctx.beginPath();

        // Horizon
        const horizonY = height * 0.55;

        // Vertical Perspective Lines
        const centerX = width / 2;
        for (let i = -10; i <= 10; i++) {
            // Perspective logic: lines converge at center horizon
            const x1 = centerX + (i * 40); // Bottom X
            const x2 = centerX + (i * 2);  // Horizon X (converging)
            ctx.moveTo(x2, horizonY);
            ctx.lineTo(x1, height);
        }

        // Horizontal Lines (moving effect could be added with offset)
        for (let i = 0; i < 10; i++) {
            const y = horizonY + (i * i * 2); // Logarithmic spacing for depth
            if (y > height) break;
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Retro Sun
        const sunGradient = ctx.createLinearGradient(centerX, horizonY - 40, centerX, horizonY);
        sunGradient.addColorStop(0, "#ffcc00");
        sunGradient.addColorStop(1, "#ff00aa");
        ctx.fillStyle = sunGradient;
        ctx.beginPath();
        ctx.arc(centerX, horizonY - 10, 30, 0, Math.PI * 2);
        ctx.fill();

        // Sun Stripes (Clip effect)
        ctx.fillStyle = COLORS.bg;
        for (let i = 0; i < 5; i++) {
            ctx.fillRect(centerX - 35, horizonY - 25 + (i * 6), 70, 2);
        }
        ctx.restore();

        // C. Entities
        // Helper to draw entities
        const drawEntity = (e: any, isFG: boolean) => {
            if (e.isDead) return;

            // Positioning
            // Lane logic: FG is lower, BG is higher and smaller/dimmer
            // BUT game engine 2D coordinates are flat. We map Y to "depth".
            // Since we use strict lanes:
            // FG Lane Y = 150 (pixel coord)
            // BG Lane Y = 140 (pixel coord) - wait, engine has Y. USE ENGINE Y.

            ctx.save();

            // 1. Shadow
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath();
            ctx.ellipse(e.x + e.width / 2, e.y + e.height, e.width / 2, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            // 2. Body GLOW
            const isP1 = (e.id === 1 || e === state.player1); // Approximate ID check
            const glowColor = isP1 ? COLORS.p1 : COLORS.p2;

            // Only glow if FG or High Energy
            if (isFG || e.specialMeter > 90) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = glowColor;
            }

            // Body Rect
            ctx.fillStyle = e.color;
            if (!isFG) ctx.globalAlpha = 0.6; // Dim BG
            ctx.fillRect(e.x, e.y, e.width, e.height);

            // Titan Details (Head)
            if (e.width > 30) {
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.fillRect(e.x + 5, e.y + 5, e.width - 10, 10); // Visor
            }

            // 3. Weapon / Action
            ctx.shadowBlur = 0; // Reset for crisp details
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

                // Attack Blur
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#ffffff";
                ctx.fillRect(swordX, e.y + 15, 30 * dir, 4);
                ctx.shadowBlur = 0;
            }

            // 4. Special Move: LUMINOUS EXPLOSION
            if (e.isUsingSpecial) {
                // Big Energy Ring
                ctx.strokeStyle = glowColor;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(e.x + e.width / 2, e.y + e.height / 2, 60, 0, Math.PI * 2);
                ctx.stroke();

                // Core
                ctx.fillStyle = "#ffffff";
                ctx.shadowBlur = 20;
                ctx.shadowColor = glowColor;
                ctx.beginPath();
                ctx.arc(e.x + e.width / 2, e.y + e.height / 2, 30, 0, Math.PI * 2);
                ctx.fill();

                // Screen Flash (Subtle)
                ctx.fillStyle = `rgba(255, 255, 255, 0.1)`;
                ctx.fillRect(0, 0, width, height);
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
