"use client";

import { useEffect, useRef, useState } from "react";
import { GameEngine, GameState } from "@/lib/game/GameEngine";
import { EntityType, Lane, Player, Titan } from "@/lib/game/Entities";
import { cn } from "@/lib/utils";

// --- Visual Constants ---
const COLORS = {
    bg: "#0a0c10", // Deeper Black
    floor: "#1a1f25", // Dark Stone
    sky: "#0a0c10", // Night Sky
    p1: "#00ffff", // Brighter Teal
    p2: "#ff3366", // Brighter Magenta-Red
    text: "#ffffff"
};

// --- Epic Visual Effects System ---
interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    life: number; maxLife: number;
    color: string; size: number;
    type: 'spark' | 'ember' | 'shockwave' | 'blood';
}

interface VisualFX {
    screenShake: { x: number; y: number; intensity: number; decay: number };
    zoom: { scale: number; targetScale: number; centerX: number; centerY: number };
    flash: { alpha: number; color: string; blendMode: GlobalCompositeOperation }; // Added blendMode
    slowMo: { active: boolean; factor: number; duration: number };
    particles: Particle[];
    impactLines: { x: number; y: number; angle: number; length: number; alpha: number }[];
}

const createVFX = (): VisualFX => ({
    screenShake: { x: 0, y: 0, intensity: 0, decay: 0.9 },
    zoom: { scale: 1, targetScale: 1, centerX: 160, centerY: 90 },
    flash: { alpha: 0, color: '#ffffff', blendMode: 'source-over' },
    slowMo: { active: false, factor: 1, duration: 0 },
    particles: [],
    impactLines: []
});

export default function GameCanvas({ p1Type, p2Type }: { p1Type: EntityType, p2Type: EntityType }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<GameEngine | null>(null);
    const inputRef = useRef<Set<string>>(new Set());
    const requestRef = useRef<number>(0);
    const vfxRef = useRef<VisualFX>(createVFX());
    const lastHitStopRef = useRef<number>(0);
    const lastTitan1DeadRef = useRef<boolean>(false);
    const lastTitan2DeadRef = useRef<boolean>(false);
    // Track player death states for animations
    const lastPlayer1DeadRef = useRef<boolean>(false);
    const lastPlayer2DeadRef = useRef<boolean>(false);
    const lastPlayer1ResurrectingRef = useRef<boolean>(false);
    const lastPlayer2ResurrectingRef = useRef<boolean>(false);
    const [gameState, setGameState] = useState<GameState | null>(null);
    // Track orb hits for shatter particles
    const lastOrb1HitRef = useRef<number>(0);
    const lastOrb2HitRef = useRef<number>(0);

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

    // --- VFX Helper Functions ---
    const spawnParticles = (x: number, y: number, count: number, color: string, type: Particle['type'] = 'spark') => {
        const vfx = vfxRef.current;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 20 + Math.random() * 80;
            vfx.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 30,
                life: 0.3 + Math.random() * 0.5,
                maxLife: 0.5,
                color,
                size: 1 + Math.random() * 3,
                type
            });
        }
    };

    const triggerScreenShake = (intensity: number) => {
        vfxRef.current.screenShake.intensity = Math.max(vfxRef.current.screenShake.intensity, intensity);
    };

    const triggerZoom = (scale: number, x: number, y: number) => {
        const vfx = vfxRef.current;
        vfx.zoom.targetScale = scale;
        vfx.zoom.centerX = x;
        vfx.zoom.centerY = y;
    };

    const triggerFlash = (alpha: number, color: string = '#ffffff', blendMode: GlobalCompositeOperation = 'source-over') => {
        vfxRef.current.flash = { alpha, color, blendMode };
    };

    const spawnImpactLines = (x: number, y: number, count: number) => {
        const vfx = vfxRef.current;
        for (let i = 0; i < count; i++) {
            vfx.impactLines.push({
                x, y,
                angle: Math.random() * Math.PI * 2,
                length: 30 + Math.random() * 50,
                alpha: 1
            });
        }
    };

    const updateVFX = (dt: number, engine: GameEngine) => {
        const vfx = vfxRef.current;
        const state = engine.state;

        // Detect new hit (hitStop increased)
        if (state.hitStop > lastHitStopRef.current && state.hitStop > 0) {
            const p1 = state.player1;
            const p2 = state.player2;

            const attacker = p1.isAttacking ? p1 : (p2.isAttacking ? p2 : null);
            if (attacker) {
                const dir = attacker.facingRight ? 1 : -1;

                // Use precise hit position from engine if available, otherwise estimate
                let impactX, impactY;

                if (state.lastHitPos) {
                    impactX = state.lastHitPos.x;
                    impactY = state.lastHitPos.y;
                } else {
                    // Fallback: Calculate impact point at the TIP of the weapon (hitbox end)
                    const stats = GameEngine.WEAPON_STATS[attacker.classType as EntityType] || { range: 30 };
                    const impactOffset = (attacker.width / 2) + stats.range - 5;
                    impactX = attacker.x + attacker.width / 2 + (impactOffset * dir);
                    impactY = attacker.y + attacker.height / 2 + (Math.random() * 20 - 10);
                }

                const isP1Attacking = attacker === p1;
                const hitColor = isP1Attacking ? '#00ffff' : '#ff3366';

                // Refined effects based on attack type
                if ((attacker as any).isUsingSpecial || state.hitStop > 10 || state.lastHitType === 'SPECIAL') {
                    // SPECIAL ATTACK HIT
                    spawnParticles(impactX, impactY, 20, '#ffffff', 'shockwave'); // More particles
                    spawnParticles(impactX, impactY, 12, hitColor, 'spark');
                    spawnImpactLines(impactX, impactY, 8);

                    triggerZoom(1.15, impactX, impactY); // Zoom on special hit
                    triggerScreenShake(8);
                    triggerFlash(0.4, '#ffffff', 'difference'); // Inverted color flash!
                } else if (state.lastHitType === 'HANDLE') {
                    // HANDLE HIT (Sour Spot) - Dull/Physical feel
                    spawnParticles(impactX, impactY, 3, '#cccccc', 'spark'); // Grey sparks
                    // No impact lines
                    triggerScreenShake(1); // Minimal shake
                    // No flash or very dim
                } else {
                    // NORMAL BLADE ATTACK (Sweet Spot)
                    spawnParticles(impactX, impactY, 5, hitColor, 'spark');
                    spawnImpactLines(impactX, impactY, 2);
                    triggerScreenShake(state.hitStop > 3 ? 3 : 1);
                    triggerFlash(0.1, hitColor);
                    // No zoom
                }
            }
        }
        lastHitStopRef.current = state.hitStop;

        // Detect Titan Death (Dramatic Zoom)
        if (state.titan1.isDead && !lastTitan1DeadRef.current) {
            triggerZoom(1.3, state.titan1.x + state.titan1.width / 2, state.titan1.y + state.titan1.height / 2);
            triggerScreenShake(10);
            triggerFlash(0.5, '#ff0000');
            state.hitStop = 60; // 1s freeze
        }
        if (state.titan2.isDead && !lastTitan2DeadRef.current) {
            triggerZoom(1.3, state.titan2.x + state.titan2.width / 2, state.titan2.y + state.titan2.height / 2);
            triggerScreenShake(10);
            triggerFlash(0.5, '#00ffff');
            state.hitStop = 60; // 1s freeze
        }
        lastTitan1DeadRef.current = state.titan1.isDead;
        lastTitan2DeadRef.current = state.titan2.isDead;

        // --- PLAYER DEATH DETECTION (Similar to Titan Death) ---
        // Player 1 Death
        if ((state.player1 as any).isDead && !lastPlayer1DeadRef.current) {
            const p = state.player1;
            triggerZoom(1.25, p.x + p.width / 2, p.y + p.height / 2);
            triggerScreenShake(8);
            triggerFlash(0.4, '#00ffff');
            spawnParticles(p.x + p.width / 2, p.y + p.height / 2, 30, '#00ffff', 'ember');
            spawnParticles(p.x + p.width / 2, p.y + p.height / 2, 15, '#ffffff', 'spark');
            state.hitStop = 40; // Freeze on death
        }
        // Player 2 Death
        if ((state.player2 as any).isDead && !lastPlayer2DeadRef.current) {
            const p = state.player2;
            triggerZoom(1.25, p.x + p.width / 2, p.y + p.height / 2);
            triggerScreenShake(8);
            triggerFlash(0.4, '#ff3366');
            spawnParticles(p.x + p.width / 2, p.y + p.height / 2, 30, '#ff3366', 'ember');
            spawnParticles(p.x + p.width / 2, p.y + p.height / 2, 15, '#ffffff', 'spark');
            state.hitStop = 40; // Freeze on death
        }
        lastPlayer1DeadRef.current = (state.player1 as any).isDead;
        lastPlayer2DeadRef.current = (state.player2 as any).isDead;

        // --- PLAYER RESURRECTION DETECTION ---
        // Player 1 Resurrection
        if ((state.player1 as any).isResurrecting && !lastPlayer1ResurrectingRef.current) {
            const p = state.player1;
            triggerZoom(1.15, p.x + p.width / 2, p.y + p.height / 2);
            triggerScreenShake(4);
            triggerFlash(0.6, '#ffffff');
            // Spawn upward rising particles (resurrection aura)
            for (let i = 0; i < 20; i++) {
                const angle = Math.PI + (Math.random() * Math.PI); // Upward arc
                const speed = 30 + Math.random() * 50;
                vfx.particles.push({
                    x: p.x + p.width / 2 + (Math.random() - 0.5) * 30,
                    y: p.y + p.height,
                    vx: Math.cos(angle) * speed * 0.3,
                    vy: -speed, // Rising up
                    life: 1.5,
                    maxLife: 1.5,
                    color: '#ffff99',
                    size: 2 + Math.random() * 3,
                    type: 'ember'
                });
            }
        }
        // Player 2 Resurrection
        if ((state.player2 as any).isResurrecting && !lastPlayer2ResurrectingRef.current) {
            const p = state.player2;
            triggerZoom(1.15, p.x + p.width / 2, p.y + p.height / 2);
            triggerScreenShake(4);
            triggerFlash(0.6, '#ffffff');
            // Spawn upward rising particles (resurrection aura)
            for (let i = 0; i < 20; i++) {
                const angle = Math.PI + (Math.random() * Math.PI); // Upward arc
                const speed = 30 + Math.random() * 50;
                vfx.particles.push({
                    x: p.x + p.width / 2 + (Math.random() - 0.5) * 30,
                    y: p.y + p.height,
                    vx: Math.cos(angle) * speed * 0.3,
                    vy: -speed, // Rising up
                    life: 1.5,
                    maxLife: 1.5,
                    color: '#ffaaff',
                    size: 2 + Math.random() * 3,
                    type: 'ember'
                });
            }
        }
        lastPlayer1ResurrectingRef.current = (state.player1 as any).isResurrecting;
        lastPlayer2ResurrectingRef.current = (state.player2 as any).isResurrecting;

        // --- CRYSTAL ORB SHATTER PARTICLES ---
        // Detect orb hits and spawn crystal shard particles
        const spawnOrbShatterParticles = (orb: any, isP1: boolean, particleCount: number) => {
            const cx = orb.x + orb.width / 2;
            const cy = orb.y + orb.height / 2;
            const baseColor = isP1 ? '#00ffff' : '#ff00ff';
            const highlightColor = '#ffffff';

            for (let i = 0; i < particleCount; i++) {
                // Crystal shards fly outward from hit point
                const angle = Math.random() * Math.PI * 2;
                const speed = 15 + Math.random() * 25; // Much slower (Subtle float)
                const isHighlight = Math.random() > 0.2; // 80% chance of white (Brighter)

                vfx.particles.push({
                    x: cx + (Math.random() - 0.5) * 8,
                    y: cy + (Math.random() - 0.5) * 8,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 20, // Slight upward bias
                    life: 0.3 + Math.random() * 0.4,
                    maxLife: 0.5,
                    color: isHighlight ? highlightColor : baseColor,
                    size: 1 + Math.random() * 2,
                    type: 'spark'
                });
            }
        };

        // Check Orb 1 hit
        const orb1HitTime = (state.orb1 as any).lastHitTime || 0;
        if (orb1HitTime > lastOrb1HitRef.current && orb1HitTime > Date.now() - 100) {
            // Determine particle count based on battle conditions
            let particleCount = 3; // Reduced from 8
            if ((state.orb1 as any).hasDefenseBonus) particleCount += 2; // Reduced from 6
            if (state.titan1.isDead) particleCount += 2; // Reduced from 4
            spawnOrbShatterParticles(state.orb1, true, particleCount);
        }
        lastOrb1HitRef.current = orb1HitTime;

        // Check Orb 2 hit
        const orb2HitTime = (state.orb2 as any).lastHitTime || 0;
        if (orb2HitTime > lastOrb2HitRef.current && orb2HitTime > Date.now() - 100) {
            // Determine particle count based on battle conditions
            let particleCount = 3; // Reduced from 8
            if ((state.orb2 as any).hasDefenseBonus) particleCount += 2; // Reduced from 6
            if (state.titan2.isDead) particleCount += 2; // Reduced from 4
            spawnOrbShatterParticles(state.orb2, false, particleCount);
        }
        lastOrb2HitRef.current = orb2HitTime;

        // Detect Final Attack (Titan Charge End)
        // We can check if charge timer just hit 0 and a special attack is active
        // But for visual impact, let's zoom when the BEAM fires (part of rendering, or check logic state)
        // If state.titanCharging is true, we can check timer. But easiest is to check frame of attack if visible.
        // Let's rely on hitStop being VERY high for final attacks if engine sets it.
        // Or checking if special is entering phase 2.

        lastHitStopRef.current = state.hitStop;

        // Update screen shake
        if (vfx.screenShake.intensity > 0.1) {
            vfx.screenShake.x = (Math.random() - 0.5) * vfx.screenShake.intensity * 2;
            vfx.screenShake.y = (Math.random() - 0.5) * vfx.screenShake.intensity * 2;
            vfx.screenShake.intensity *= 0.85;
        } else {
            vfx.screenShake.x = 0;
            vfx.screenShake.y = 0;
            vfx.screenShake.intensity = 0;
        }

        // Update zoom (smooth lerp)
        vfx.zoom.scale += (vfx.zoom.targetScale - vfx.zoom.scale) * 0.1;
        if (vfx.zoom.targetScale > 1) {
            vfx.zoom.targetScale += (1 - vfx.zoom.targetScale) * 0.02; // Slowly return
        }

        // Update flash
        if (vfx.flash.alpha > 0) {
            vfx.flash.alpha *= 0.85;
        }

        // Update particles
        vfx.particles = vfx.particles.filter(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 200 * dt; // Gravity
            p.life -= dt;
            return p.life > 0;
        });

        // Update impact lines
        vfx.impactLines = vfx.impactLines.filter(l => {
            l.alpha *= 0.9;
            l.length += 5;
            return l.alpha > 0.05;
        });
    };

    // Game Loop & Rendering (Robust Init)
    useEffect(() => {
        let animationFrameId: number;
        let isRunning = true;

        const initGameLoop = () => {
            const canvas = canvasRef.current;
            if (!canvas) {
                if (isRunning) requestAnimationFrame(initGameLoop);
                return;
            }

            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) return;

            console.log("Canvas Found. Starting Epic Loop.");
            let lastTime = performance.now();

            const render = (time: number) => {
                if (!isRunning) return;

                const dt = Math.min((time - lastTime) / 1000, 0.1);
                lastTime = time;

                if (engineRef.current) {
                    // Update VFX
                    updateVFX(dt, engineRef.current);

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
        const vfx = vfxRef.current;

        // Save and apply VFX transforms
        ctx.save();

        // Apply screen shake
        ctx.translate(vfx.screenShake.x, vfx.screenShake.y);

        // Apply zoom (center on impact point)
        if (vfx.zoom.scale !== 1) {
            const offsetX = (width / 2) - vfx.zoom.centerX;
            const offsetY = (height / 2) - vfx.zoom.centerY;
            ctx.translate(width / 2, height / 2);
            ctx.scale(vfx.zoom.scale, vfx.zoom.scale);
            ctx.translate(-width / 2 + offsetX * (vfx.zoom.scale - 1), -height / 2 + offsetY * (vfx.zoom.scale - 1));
        }

        // A. Epic Background
        // Gradient sky
        const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.6);
        skyGrad.addColorStop(0, '#050508');
        skyGrad.addColorStop(0.5, '#0a0c15');
        skyGrad.addColorStop(1, '#101525');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height);

        // Animated stars
        ctx.fillStyle = '#ffffff';
        const time = Date.now() / 1000;
        for (let i = 0; i < 30; i++) {
            const sx = (i * 47 + time * 2) % width;
            const sy = (i * 23) % (height * 0.5);
            const twinkle = Math.sin(time * 3 + i) * 0.5 + 0.5;
            ctx.globalAlpha = 0.3 + twinkle * 0.7;
            ctx.fillRect(sx, sy, 1, 1);
        }
        ctx.globalAlpha = 1;

        // Epic Moon with glow
        const moonX = width * 0.85;
        const moonY = height * 0.15;

        // Moon glow
        const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 30);
        moonGlow.addColorStop(0, 'rgba(255, 240, 200, 0.3)');
        moonGlow.addColorStop(0.5, 'rgba(255, 200, 150, 0.1)');
        moonGlow.addColorStop(1, 'rgba(255, 200, 150, 0)');
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 30, 0, Math.PI * 2);
        ctx.fill();

        // Moon core
        ctx.fillStyle = '#fffef0';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 8, 0, Math.PI * 2);
        ctx.fill();

        // Floor (Gradient stone)
        const horizonY = height * 0.55;
        const floorGrad = ctx.createLinearGradient(0, horizonY, 0, height);
        floorGrad.addColorStop(0, '#252a35');
        floorGrad.addColorStop(1, '#151820');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, horizonY, width, height - horizonY);

        // Floor Details (Tiles with depth)
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        const tileSize = 20;
        for (let y = horizonY; y < height; y += tileSize) {
            for (let x = 0; x < width; x += tileSize) {
                if (((x + y) / tileSize) % 2 === 0) {
                    ctx.fillRect(x, y, tileSize, tileSize);
                }
            }
        }

        // Shrine Pillars (Background Pillars)
        const pillarWidth = 15;
        const pillarHeight = 80;
        ctx.fillStyle = "#8b0000"; // Deep Red
        [40, 100, 220, 280].forEach(px => {
            ctx.fillRect(px, horizonY - pillarHeight, pillarWidth, pillarHeight);
            // Pillar shading
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.fillRect(px + 10, horizonY - pillarHeight, 5, pillarHeight);
            ctx.fillStyle = "#8b0000"; // Reset
        });

        // C. Entities
        const drawEntity = (e: any, isFG: boolean) => {
            // For Titans, skip if dead
            if (e.isDead && e.classType === 'TITAN') return;

            // For Players: Handle death and resurrection animations
            const isPlayer = e.classType !== 'TITAN';
            const isRespawning = isPlayer && e.isRespawning;
            const isResurrecting = isPlayer && e.isResurrecting;

            // If player is dead but not in special animation states, skip
            if (e.isDead && !isRespawning) return;

            // Positioning logic used in engine
            ctx.save();

            const isP1 = (e.id === 1 || e === state.player1);
            const baseColor = isP1 ? COLORS.p1 : COLORS.p2;

            // 1. Shadow (clean, no blur)
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(e.x + 2, e.y + e.height - 2, e.width, 4);

            // 2. Body - solid color with subtle highlight
            let bodyColor = e.color;
            if (!isFG) {
                if (e.classType === 'TITAN') {
                    bodyColor = e.color;
                } else if (isP1) {
                    bodyColor = "#007777";
                } else {
                    bodyColor = "#993344";
                }
            }

            // --- DEATH POSE: Rotate body to lie down (ethereal ghost effect) ---
            if (isRespawning && e.deathAnimFrame !== undefined) {
                const maxDeathFrames = 120;
                const progress = Math.min(1, e.deathAnimFrame / maxDeathFrames);

                // Rotate to lying position (90 degrees over first 30% of animation)
                const rotationProgress = Math.min(1, progress / 0.3);
                const rotation = rotationProgress * (Math.PI / 2); // 90 degrees

                // Very ethereal transparency
                ctx.globalAlpha = Math.max(0.05, 0.4 * (1 - progress * 0.9));

                // Apply rotation transformation
                const cx = e.x + e.width / 2;
                const cy = e.y + e.height;
                ctx.translate(cx, cy);
                ctx.rotate(rotation);
                ctx.translate(-cx, -cy);

                // Draw ethereal ghost body (semi-transparent with glow effect)
                const ghostColor = isP1 ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 100, 150, 0.3)';
                ctx.fillStyle = ghostColor;
                ctx.fillRect(e.x, e.y, e.width, e.height);

                // Ghost inner glow
                const innerGlow = isP1 ? 'rgba(200, 255, 255, 0.2)' : 'rgba(255, 200, 220, 0.2)';
                ctx.fillStyle = innerGlow;
                ctx.fillRect(e.x + 2, e.y + 2, e.width - 4, e.height - 4);

                // Reset transformation
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                // Re-apply zoom/shake transforms
                const vfx = vfxRef.current;
                ctx.translate(vfx.screenShake.x, vfx.screenShake.y);
                if (vfx.zoom.scale !== 1) {
                    const offsetX = (width / 2) - vfx.zoom.centerX;
                    const offsetY = (height / 2) - vfx.zoom.centerY;
                    ctx.translate(width / 2, height / 2);
                    ctx.scale(vfx.zoom.scale, vfx.zoom.scale);
                    ctx.translate(-width / 2 + offsetX * (vfx.zoom.scale - 1), -height / 2 + offsetY * (vfx.zoom.scale - 1));
                }
            } else {
                // Normal body rendering (not dying)
                // Simple body fill
                ctx.fillStyle = bodyColor;
                ctx.fillRect(e.x, e.y, e.width, e.height);
            }

            // Skip normal body details when dying (only show ethereal ghost)
            if (!isRespawning) {
                // Subtle highlight on top
                ctx.fillStyle = "rgba(255,255,255,0.15)";
                ctx.fillRect(e.x, e.y, e.width, e.height / 3);

                // Clean outline (no blur)
                ctx.strokeStyle = isP1 ? '#00cccc' : '#cc3355';
                ctx.lineWidth = 1;
                ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.width - 1, e.height - 1);

                // Pixel Art Details
                ctx.fillStyle = "rgba(255,255,255,0.9)";

                // Headband / Visor
                if (e.classType === 'TITAN') {
                    // Titan Eyes (solid, menacing)
                    ctx.fillStyle = "#ff0000";
                    ctx.fillRect(e.x + e.width / 2 - 8, e.y + 20, 6, 4);
                    ctx.fillRect(e.x + e.width / 2 + 2, e.y + 20, 6, 4);
                } else {
                    // Player Eyes (clean)
                    const eyeX = e.facingRight ? e.x + e.width - 8 : e.x + 4;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(eyeX, e.y + 10, 4, 4);

                    // Simple Headband
                    ctx.fillStyle = isP1 ? '#ffffff' : '#660033';
                    ctx.fillRect(e.x, e.y + 4, e.width, 3);
                }
            }


            // 3. Weapon / Action

            ctx.globalAlpha = 1.0;

            if (e.isBlocking) {
                // Clean Shield (no blur)
                ctx.fillStyle = 'rgba(150, 180, 255, 0.85)';
                const shieldX = e.facingRight ? e.x + e.width : e.x - 5;
                ctx.fillRect(shieldX, e.y - 3, 5, e.height + 6);
                // Shield highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillRect(shieldX + 1, e.y - 3, 2, e.height + 6);
            }

            if (e.isAttacking) {
                const stats = GameEngine.WEAPON_STATS[e.classType as EntityType] || { range: 30 };
                const range = stats.range;
                const dir = e.facingRight ? 1 : -1;
                const startX = e.x + (e.width / 2) + (e.width / 2 * dir);
                const weaponColor = isP1 ? '#00ffff' : '#ff3366';

                // Weapon glow
                ctx.shadowColor = weaponColor;
                ctx.shadowBlur = 12;

                // Weapon shaft
                let swordH = 3;
                let tipW = 0;
                let tipH = 0;

                if (e.classType === 'MONK') {
                    swordH = 5;
                    tipW = 12;
                    tipH = 15;
                } else if (e.classType === 'NINJA') {
                    swordH = 2;
                    tipW = 10;
                    tipH = 4;
                }

                const swordRectX = e.facingRight ? startX : startX - range;

                // Weapon gradient
                const weaponGrad = ctx.createLinearGradient(swordRectX, e.y + 25, swordRectX + range, e.y + 25);
                weaponGrad.addColorStop(0, '#aaaaaa');
                weaponGrad.addColorStop(0.5, '#ffffff');
                weaponGrad.addColorStop(1, weaponColor);
                ctx.fillStyle = weaponGrad;
                ctx.fillRect(swordRectX, e.y + 25, range, swordH);

                // Weapon tip
                if (tipW > 0) {
                    const tipX = e.facingRight ? (startX + range - tipW) : (startX - range);
                    const tipY = e.y + 25 - (tipH / 2) + (swordH / 2);
                    ctx.fillStyle = weaponColor;
                    ctx.fillRect(tipX, tipY, tipW, tipH);
                }

                // Simple Attack Swipe (clean arc)
                ctx.shadowBlur = 0;
                const swipeW = range + 10;
                const swipeRectX = e.facingRight ? startX : startX - swipeW;

                // Single clean swipe (solid color)
                ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
                ctx.fillRect(swipeRectX, e.y + 15, swipeW, 20);
            }

            // Crouching Visual
            if (e.isCrouching) {
                // Already handled by logic? No, just visual usually if hitbox constant
                // But let's squash them visually if logic doesn't change Height
                // For now, assume height stays same but we could draw them lower top?
                // Let's just draw effective height. logic x/y/w/h is truth.
            }

            // 4. Special Move: FLASH
            // 4. Special Move: CHARGE & BLAST
            if (e.isUsingSpecial) {
                const chargeDuration = 15; // Matches Logic (reduced)
                const frame = e.specialFrame;

                if (frame < chargeDuration) {
                    // --- PHASE 1: CHARGING BEAM ---
                    // Glow travels from Center to Weapon Tip
                    const progress = frame / chargeDuration;

                    // Center of Player
                    const cx = e.x + e.width / 2;
                    const cy = e.y + e.height / 2;

                    // Direction
                    const dir = e.facingRight ? 1 : -1;
                    const maxDist = 60; // Reduced from 80

                    // Current Ball Position
                    const bx = cx + (maxDist * progress * dir);
                    const by = cy; // Keep horizontal for now

                    // Draw Energy Stream (Trail)
                    const grad = ctx.createLinearGradient(cx, cy, bx, by);
                    grad.addColorStop(0, "rgba(255, 255, 255, 0)");
                    grad.addColorStop(1, isP1 ? "#00ffff" : "#ff00ff");

                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(bx, by);
                    ctx.lineWidth = 3 + (progress * 3); // Slightly thinner
                    ctx.strokeStyle = grad;
                    ctx.stroke();

                    // Draw Leading Orb
                    ctx.fillStyle = "#ffffff";
                    ctx.beginPath();
                    ctx.arc(bx, by, 4 + (progress * 4), 0, Math.PI * 2); // Smaller orb
                    ctx.fill();

                    // Lens Flare Halo
                    ctx.fillStyle = isP1 ? "rgba(0, 255, 255, 0.4)" : "rgba(255, 0, 255, 0.4)";
                    ctx.beginPath();
                    ctx.arc(bx, by, 8 + (progress * 10), 0, Math.PI * 2); // Smaller halo
                    ctx.fill();

                } else {
                    // --- PHASE 2: IMPACT EXPLOSION ---
                    // Explosion centered at the weapon tip

                    // Calculate tip position (same as logic)
                    const dir = e.facingRight ? 1 : -1;
                    const cx = e.x + e.width / 2;
                    const cy = e.y + e.height / 2;
                    const tipDistance = 60;
                    const tipX = cx + (tipDistance * dir);
                    const tipY = cy;

                    // Flickering color
                    if (Math.floor(frame / 2) % 2 === 0) {
                        ctx.fillStyle = isP1 ? "#aaffff" : "#ffaaaa";
                    } else {
                        ctx.fillStyle = "#ffffff";
                    }

                    // Draw circular explosion at tip
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.arc(tipX, tipY, 35, 0, Math.PI * 2); // Larger explosion
                    ctx.fill();

                    // Inner bright core
                    ctx.fillStyle = "#ffffff";
                    ctx.beginPath();
                    ctx.arc(tipX, tipY, 15, 0, Math.PI * 2);
                    ctx.fill();

                    // --- SPECIAL MASSIVE SWIPE ---
                    const swipeW = 90; // Giant swipe
                    const swipeH = 50;
                    const swipeRectX = e.facingRight ? cx : cx - swipeW;

                    const specGrad = ctx.createLinearGradient(swipeRectX, 0, swipeRectX + swipeW, 0); // Correct gradient direction
                    if (e.facingRight) {
                        specGrad.addColorStop(0, 'rgba(255,255,255,0)');
                        specGrad.addColorStop(0.3, isP1 ? 'rgba(0, 255, 255, 0.9)' : 'rgba(255, 0, 100, 0.9)');
                        specGrad.addColorStop(1, '#ffffff');
                    } else {
                        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
                        specGrad.addColorStop(0.7, isP1 ? 'rgba(0, 255, 255, 0.9)' : 'rgba(255, 0, 100, 0.9)');
                        specGrad.addColorStop(0, '#ffffff');
                    }

                    ctx.fillStyle = specGrad;
                    ctx.fillRect(swipeRectX, cy - swipeH / 2, swipeW, swipeH);

                    ctx.globalAlpha = 1.0;
                }
            }

            // --- ADDITIONAL DEATH EFFECTS (Floating particles) ---
            if (isRespawning && e.deathAnimFrame !== undefined) {
                const progress = Math.min(1, e.deathAnimFrame / 120);

                // Ethereal floating particles rising up
                if (e.deathAnimFrame % 5 === 0 && progress < 0.9) {
                    ctx.globalAlpha = 0.4 * (1 - progress);
                    const cx = e.x + e.width / 2;
                    const cy = e.y + e.height / 2;
                    ctx.fillStyle = isP1 ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 100, 150, 0.5)';
                    for (let i = 0; i < 2; i++) {
                        const px = cx + (Math.random() - 0.5) * e.width * 2;
                        const py = cy - (Math.random() * e.height); // Rising up
                        ctx.beginPath();
                        ctx.arc(px, py, 1 + Math.random() * 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                }
            }

            // --- RESURRECTION ANIMATION (Glowing/Materializing) ---
            if (isResurrecting && e.resurrectionAnimFrame !== undefined) {
                const maxResFrames = 60; // 1 second animation
                const progress = Math.min(1, e.resurrectionAnimFrame / maxResFrames);

                // Light circle expanding from below
                const cx = e.x + e.width / 2;
                const cy = e.y + e.height;
                const radius = 5 + progress * 40;

                const resurrectGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                resurrectGlow.addColorStop(0, 'rgba(255, 255, 200, 0.8)');
                resurrectGlow.addColorStop(0.5, isP1 ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 100, 150, 0.4)');
                resurrectGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.fillStyle = resurrectGlow;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();

                // Rising light beams
                if (progress < 0.7) {
                    ctx.globalAlpha = 0.6 * (1 - progress);
                    ctx.fillStyle = '#ffffff';
                    for (let i = 0; i < 3; i++) {
                        const beamX = e.x + (e.width / 4) * (i + 0.5);
                        const beamH = 30 + progress * 20;
                        ctx.fillRect(beamX - 1, e.y + e.height - beamH, 2, beamH);
                    }
                    ctx.globalAlpha = 1;
                }

                // Body glow outline
                ctx.shadowColor = isP1 ? '#00ffff' : '#ff6699';
                ctx.shadowBlur = 10 * (1 - progress);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.strokeRect(e.x, e.y, e.width, e.height);
                ctx.shadowBlur = 0;
            }

            // HP Bar (Overhead) - Simple Pixel (Hide if respawning)
            if (!isRespawning) {
                const hpPct = Math.max(0, e.health / e.maxHealth);
                ctx.fillStyle = "#000000";
                ctx.fillRect(e.x, e.y - 6, e.width, 4);
                ctx.fillStyle = "#00ff00"; // Classic Green
                if (hpPct < 0.3) ctx.fillStyle = "#ff0000";
                ctx.fillRect(e.x, e.y - 6, e.width * hpPct, 4);

            }

            ctx.restore();
        };

        // Render Order: BG Lane -> FG Lane
        const ent = [state.player1, state.player2, state.titan1, state.titan2];

        // Helper: Sort function (Titans First, then Players) so Players are on top
        const zSort = (a: any, b: any) => {
            if (a.classType === 'TITAN' && b.classType !== 'TITAN') return -1;
            if (a.classType !== 'TITAN' && b.classType === 'TITAN') return 1;
            return 0;
        };

        const bgEnts = ent.filter(e => e.lane === 'BACKGROUND').sort(zSort);
        const fgEnts = ent.filter(e => e.lane === 'FOREGROUND').sort(zSort);

        bgEnts.forEach(e => drawEntity(e, false));
        fgEnts.forEach(e => drawEntity(e, true));

        // Render Crystal Orbs (Gem aesthetic like Breath of Fire 3)
        const drawOrb = (orb: any, isP1: boolean) => {
            if (orb.isDead) return;

            const ox = orb.x;
            const oy = orb.y;
            const baseSize = orb.width * 0.65; // Reduced size for better proportions
            const cx = ox + orb.width / 2;
            const cy = oy + orb.height / 2;

            ctx.save();

            // === DYNAMIC GLOW PARAMETERS ===
            // Base pulse speed (slower = calmer)
            let pulseSpeed = 400; // ms per cycle
            let glowIntensity = 0.4;
            let pulseAmplitude = 0.15;

            // Defense bonus active = stronger color
            if (orb.hasDefenseBonus) {
                glowIntensity = 0.7;
            }

            // Armor regenerating fast (titan dead) = more pulsing/intense
            if (!orb.isShielded) {
                pulseSpeed = 150; // Faster pulse when vulnerable
                pulseAmplitude = 0.3;
            }

            // Calculate pulse value
            const time = Date.now();
            const pulse = Math.sin(time / pulseSpeed) * pulseAmplitude + (1 - pulseAmplitude);

            // === OUTER GLOW (Ethereal aura) ===
            const glowRadius = baseSize * 1.8;
            const glowGradient = ctx.createRadialGradient(cx, cy, baseSize * 0.3, cx, cy, glowRadius);
            const baseColor = isP1 ? 'rgba(0, 255, 255,' : 'rgba(255, 0, 255,';
            glowGradient.addColorStop(0, baseColor + (glowIntensity * pulse) + ')');
            glowGradient.addColorStop(0.5, baseColor + (glowIntensity * pulse * 0.3) + ')');
            glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = glowGradient;
            ctx.beginPath();
            ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            // === FORCE FIELD (when shielded) ===
            if (orb.isShielded) {
                const shieldPulse = Math.sin(time / 200) * 0.15 + 0.6; // Faster, tighter pulse (0.45 - 0.75)
                ctx.globalAlpha = shieldPulse;
                const shieldColor = isP1 ? '#00ffff' : '#ff00ff';

                ctx.strokeStyle = shieldColor;
                ctx.lineWidth = 1.5; // Thinner, sharper line

                // Add powerful glow
                ctx.shadowColor = shieldColor;
                ctx.shadowBlur = 10;

                ctx.beginPath();
                ctx.arc(cx, cy, baseSize * 1.3, 0, Math.PI * 2);
                ctx.stroke();

                // Reset shadow and alpha
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 1;
            }

            // === CRYSTAL GEM SHAPE (Faceted diamond/hexagon) ===
            // Draw a gem-like polygon shape
            const drawGem = (scale: number, fillStyle: string | CanvasGradient, strokeStyle?: string) => {
                ctx.beginPath();
                // Top point
                ctx.moveTo(cx, cy - baseSize * scale);
                // Upper right facet
                ctx.lineTo(cx + baseSize * scale * 0.7, cy - baseSize * scale * 0.3);
                // Right point
                ctx.lineTo(cx + baseSize * scale * 0.5, cy + baseSize * scale * 0.2);
                // Lower right
                ctx.lineTo(cx + baseSize * scale * 0.3, cy + baseSize * scale * 0.7);
                // Bottom point
                ctx.lineTo(cx, cy + baseSize * scale * 0.9);
                // Lower left
                ctx.lineTo(cx - baseSize * scale * 0.3, cy + baseSize * scale * 0.7);
                // Left point
                ctx.lineTo(cx - baseSize * scale * 0.5, cy + baseSize * scale * 0.2);
                // Upper left facet
                ctx.lineTo(cx - baseSize * scale * 0.7, cy - baseSize * scale * 0.3);
                ctx.closePath();

                ctx.fillStyle = fillStyle;
                ctx.fill();

                if (strokeStyle) {
                    ctx.strokeStyle = strokeStyle;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            };

            // Outer crystal shell (darker)
            const shellGradient = ctx.createLinearGradient(cx - baseSize, cy - baseSize, cx + baseSize, cy + baseSize);
            if (isP1) {
                shellGradient.addColorStop(0, '#003333');
                shellGradient.addColorStop(0.5, '#006666');
                shellGradient.addColorStop(1, '#004444');
            } else {
                shellGradient.addColorStop(0, '#330033');
                shellGradient.addColorStop(0.5, '#660066');
                shellGradient.addColorStop(1, '#440044');
            }
            drawGem(1.0, shellGradient, isP1 ? '#00aaaa' : '#aa00aa');

            // Inner crystal core (brighter, pulsing)
            const coreGradient = ctx.createRadialGradient(cx, cy - baseSize * 0.3, 0, cx, cy, baseSize * 0.6);
            if (isP1) {
                coreGradient.addColorStop(0, `rgba(255, 255, 255, ${0.9 * pulse})`);
                coreGradient.addColorStop(0.4, `rgba(0, 255, 255, ${0.8 * pulse})`);
                coreGradient.addColorStop(1, `rgba(0, 100, 100, ${0.5 * pulse})`);
            } else {
                coreGradient.addColorStop(0, `rgba(255, 255, 255, ${0.9 * pulse})`);
                coreGradient.addColorStop(0.4, `rgba(255, 0, 255, ${0.8 * pulse})`);
                coreGradient.addColorStop(1, `rgba(100, 0, 100, ${0.5 * pulse})`);
            }
            drawGem(0.65, coreGradient);

            // === CRYSTAL FACET HIGHLIGHTS ===
            ctx.globalAlpha = 0.6 * pulse;
            ctx.fillStyle = '#ffffff';
            // Top facet highlight
            ctx.beginPath();
            ctx.moveTo(cx, cy - baseSize * 0.8);
            ctx.lineTo(cx + baseSize * 0.15, cy - baseSize * 0.5);
            ctx.lineTo(cx - baseSize * 0.1, cy - baseSize * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;

            // === CENTER ORB (The actual orb inside the crystal) ===
            const orbSize = baseSize * 0.25;
            const orbGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbSize);
            orbGlow.addColorStop(0, '#ffffff');
            orbGlow.addColorStop(0.5, isP1 ? '#00ffff' : '#ff00ff');
            orbGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = orbGlow;
            ctx.beginPath();
            ctx.arc(cx, cy, orbSize, 0, Math.PI * 2);
            ctx.fill();

            // === HIT FLASH EFFECT ===
            // Flash when recently hit
            const timeSinceHit = time - orb.lastHitTime;
            if (timeSinceHit < 150) {
                const flashIntensity = 1 - (timeSinceHit / 150);
                ctx.globalAlpha = flashIntensity * 0.7;
                ctx.fillStyle = '#ffffff';
                drawGem(1.1, '#ffffff');
                ctx.globalAlpha = 1;
            }

            // === HEALTH/ARMOR BAR (when vulnerable) ===
            if (!orb.isShielded) {
                const barWidth = baseSize * 1.5;
                const barHeight = 3;
                const barX = cx - barWidth / 2;
                const barY = cy - baseSize * 1.2;

                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(barX, barY, barWidth, barHeight);

                // Health (red)
                const hpPct = Math.max(0, orb.health / orb.maxHealth);
                ctx.fillStyle = '#cc3333';
                ctx.fillRect(barX, barY, barWidth * hpPct, barHeight);

                // Armor overlay (yellow/gold)
                if (orb.armor > 0) {
                    const armorPct = Math.max(0, orb.armor / orb.maxArmor);
                    ctx.fillStyle = '#ffcc00';
                    ctx.fillRect(barX, barY, barWidth * armorPct, barHeight);
                }

                // Border
                ctx.strokeStyle = isP1 ? '#00aaaa' : '#aa00aa';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barWidth, barHeight);
            }

            ctx.restore();
        };

        drawOrb(state.orb1, true);
        drawOrb(state.orb2, false);

        // --- RENDER EPIC VFX ---

        // Impact Lines (Speed/Action lines)
        vfx.impactLines.forEach(line => {
            ctx.save();
            ctx.globalAlpha = line.alpha;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(line.x, line.y);
            ctx.lineTo(
                line.x + Math.cos(line.angle) * line.length,
                line.y + Math.sin(line.angle) * line.length
            );
            ctx.stroke();
            ctx.restore();
        });

        // Particles
        vfx.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;

            if (p.type === 'spark') {
                // Elongated spark based on velocity
                ctx.beginPath();
                ctx.moveTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
                ctx.lineTo(p.x + p.vx * 0.02, p.y + p.vy * 0.02);
                ctx.lineWidth = p.size;
                ctx.strokeStyle = p.color;
                ctx.stroke();
            } else if (p.type === 'ember') {
                // Glowing ember
                const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
                glow.addColorStop(0, p.color);
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
            ctx.restore();
        });

        // Restore from zoom/shake transforms
        ctx.restore();

        // Screen Flash (drawn on top, outside transforms)
        if (vfx.flash.alpha > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = vfx.flash.blendMode;
            ctx.globalAlpha = vfx.flash.alpha;
            ctx.fillStyle = vfx.flash.color;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        // Dramatic vignette effect
        const vignetteGrad = ctx.createRadialGradient(
            width / 2, height / 2, height * 0.3,
            width / 2, height / 2, height * 0.7
        );
        vignetteGrad.addColorStop(0, 'transparent');
        vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, width, height);
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
        <div className="absolute top-0 left-0 w-full p-2 flex flex-col pointer-events-none">
            {/* TITAN CHARGE TIMER (shows when Titan is charging final attack) */}
            {state.titanCharging > 0 && (
                <div className="w-full flex justify-center mb-1">
                    <div className="text-xl text-red-500 font-bold font-mono animate-pulse">
                        ⚡ {Math.ceil(state.titanChargeTimer)}s ⚡
                    </div>
                </div>
            )}

            <div className="flex justify-between w-full text-white font-sans text-xs">
                {/* Player 1 Stats */}
                <div className="flex flex-col gap-1 w-1/3">
                    <div className="flex items-center gap-2">
                        <span className="text-teal-400">P1</span>
                        {/* Respawn Timer */}
                        {(state.player1 as any).isRespawning && (
                            <span className="text-yellow-300 text-[10px] animate-pulse">
                                ⏱️ {Math.ceil((state.player1 as any).respawnTimer)}s
                            </span>
                        )}
                    </div>
                    <HealthBar current={state.player1.health} max={state.player1.maxHealth} color="bg-teal-500" />
                    {/* Special Bar P1 */}
                    <div className="w-full h-1 bg-gray-900 border border-white/20">
                        <div className="h-full bg-white transition-all duration-75" style={{ width: `${(state.player1 as any).specialMeter}%` }} />
                    </div>
                    {/* Titan Defense Charge Indicator P1 */}
                    {(state.titan1 as any).proximityCharge > 0 && (
                        <div className="flex items-center gap-1 text-[8px] mt-0.5 w-full">
                            <span className={(state.titan1 as any).proximityCharge >= 0.99 ? "text-white font-bold animate-pulse" : "text-cyan-300"}>
                                🛡️ {(state.titan1 as any).proximityCharge >= 0.99 ? "MAX DEF" : "TITAN DEF"}
                            </span>
                            <div className="w-16 h-1 bg-gray-800 border border-cyan-500/30">
                                <div className={`h-full transition-all duration-200 ${(state.titan1 as any).proximityCharge >= 0.99 ? 'bg-white shadow-[0_0_5px_#00ffff]' : 'bg-cyan-500'}`} style={{ width: `${(state.titan1 as any).proximityCharge * 100}%` }} />
                            </div>
                        </div>
                    )}
                    {/* Orb Defense Bonus Indicator */}
                    {(state.orb1 as any).hasDefenseBonus && (
                        <div className="text-[8px] text-blue-300">🛡️ ORB DEF +50%</div>
                    )}
                    {/* Enemy Orb HP (P2's orb) - shows temporarily after hit */}
                    {Date.now() - (state.orb2 as any).lastHitTime < 3000 && (
                        <div className="mt-1">
                            <span className="text-yellow-400 text-[10px]">ORB</span>
                            <div className="w-full h-2 bg-gray-900 border border-yellow-500/50 relative overflow-hidden">
                                {/* HP Bar (red background) */}
                                <div className="h-full bg-red-600 transition-all duration-200 absolute left-0 top-0" style={{ width: `${(state.orb2.health / state.orb2.maxHealth) * 100}%` }} />
                                {/* Armor Bar (yellow overlay) */}
                                <div className="h-full bg-yellow-400 transition-all duration-200 absolute left-0 top-0" style={{ width: `${((state.orb2 as any).armor / (state.orb2 as any).maxArmor) * 100}%` }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Player 2 Stats */}
                <div className="flex flex-col gap-1 items-end w-1/3">
                    <div className="flex items-center gap-2">
                        {/* Respawn Timer */}
                        {(state.player2 as any).isRespawning && (
                            <span className="text-yellow-300 text-[10px] animate-pulse">
                                ⏱️ {Math.ceil((state.player2 as any).respawnTimer)}s
                            </span>
                        )}
                        <span className="text-red-400">P2</span>
                    </div>
                    <HealthBar current={state.player2.health} max={state.player2.maxHealth} color="bg-red-500" />
                    {/* Special Bar P2 */}
                    <div className="w-full h-1 bg-gray-900 border border-white/20">
                        <div className="h-full bg-white transition-all duration-75" style={{ width: `${(state.player2 as any).specialMeter}%` }} />
                    </div>
                    {/* Titan Defense Charge Indicator P2 */}
                    {(state.titan2 as any).proximityCharge > 0 && (
                        <div className="flex items-center gap-1 text-[8px] mt-0.5 justify-end w-full">
                            <div className="w-16 h-1 bg-gray-800 border border-pink-500/30">
                                <div className={`h-full transition-all duration-200 ${(state.titan2 as any).proximityCharge >= 0.99 ? 'bg-white shadow-[0_0_5px_#ff00ff]' : 'bg-pink-500'}`} style={{ width: `${(state.titan2 as any).proximityCharge * 100}%` }} />
                            </div>
                            <span className={(state.titan2 as any).proximityCharge >= 0.99 ? "text-white font-bold animate-pulse" : "text-pink-300"}>
                                {(state.titan2 as any).proximityCharge >= 0.99 ? "MAX DEF" : "TITAN DEF"} 🛡️
                            </span>
                        </div>
                    )}
                    {/* Orb Defense Bonus Indicator */}
                    {(state.orb2 as any).hasDefenseBonus && (
                        <div className="text-[8px] text-blue-300">🛡️ ORB DEF +50%</div>
                    )}
                    {/* Enemy Orb HP (P1's orb) - shows temporarily after hit */}
                    {Date.now() - (state.orb1 as any).lastHitTime < 3000 && (
                        <div className="mt-1 w-full">
                            <span className="text-yellow-400 text-[10px]">ORB</span>
                            <div className="w-full h-2 bg-gray-900 border border-yellow-500/50 relative overflow-hidden">
                                {/* HP Bar (red background) */}
                                <div className="h-full bg-red-600 transition-all duration-200 absolute left-0 top-0" style={{ width: `${(state.orb1.health / state.orb1.maxHealth) * 100}%` }} />
                                {/* Armor Bar (yellow overlay) */}
                                <div className="h-full bg-yellow-400 transition-all duration-200 absolute left-0 top-0" style={{ width: `${((state.orb1 as any).armor / (state.orb1 as any).maxArmor) * 100}%` }} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function HealthBar({ current, max, color }: { current: number, max: number, color: string }) {
    const pct = Math.max(0, (current / max) * 100);
    return (
        <div className="w-full h-2 bg-gray-900 border border-white/20 overflow-hidden">
            <div
                className={cn("h-full transition-all duration-200", color)}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}
