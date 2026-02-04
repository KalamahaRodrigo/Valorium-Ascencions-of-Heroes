"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { Plane, Box, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { GameEngine, GameState } from "@/lib/game/GameEngine";
import { EntityType, Lane } from "@/lib/game/Entities";
import { cn } from "@/lib/utils";

// --- 3D Scene Config ---
const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 180;

// Mapping Game Coordinates (0-320, 0-180) to 3D World (x: -16 to 16, y: -9 to 9)
const SCALE_X = 32 / INTERNAL_WIDTH;
const SCALE_Y = 18 / INTERNAL_HEIGHT;
const OFFSET_X = -16;
const OFFSET_Y = -9;

function to3D(x: number, y: number, lane: Lane) {
    const wx = x * SCALE_X + OFFSET_X;
    const wy = -(y * SCALE_Y + OFFSET_Y); // Y is flipped in Canvas2D usually
    const wz = lane === 'BACKGROUND' ? -5 : 0;
    return [wx, wy, wz] as [number, number, number];
}

// --- Entities ---
function GameEntities({ engine }: { engine: GameEngine }) {
    const { player1, player2, titan1, titan2 } = engine.state;
    const entities = [player1, player2, titan1, titan2];

    return (
        <group>
            {entities.map((e, i) => {
                if (e.isDead) return null;

                const [x, y, z] = to3D(e.x, e.y, e.lane);
                const w = e.width * SCALE_X;
                const h = e.height * SCALE_Y;

                // Color mapping
                const color = e.isBlocking ? "#ffffff" : e.color; // Flash white on block
                const intensity = (e as any).isAttacking ? 5 : 2;

                return (
                    <mesh key={i} position={[x + w / 2, y - h / 2, z]}>
                        <boxGeometry args={[w, h, 1]} />
                        <meshStandardMaterial
                            color={color}
                            emissive={color}
                            emissiveIntensity={intensity}
                            toneMapped={false}
                        />
                    </mesh>
                );
            })}
        </group>
    );
}

// --- Environment ---
function SynthwaveEnv() {
    const gridRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (gridRef.current) {
            // Move grid effect
            (gridRef.current.material as THREE.Material).needsUpdate = true;
            // Just a simple scrolling texture effect simulation via position if needed
            gridRef.current.position.z = (state.clock.elapsedTime * 2) % 2;
        }
    });

    return (
        <group>
            {/* Retro Sun */}
            <mesh position={[0, 5, -20]}>
                <circleGeometry args={[15, 64]} />
                <meshBasicMaterial color="#ff00aa" />
            </mesh>

            {/* Sun Glow */}
            <mesh position={[0, 5, -21]}>
                <circleGeometry args={[16, 64]} />
                <meshBasicMaterial color="#ffbd00" transparent opacity={0.5} />
            </mesh>

            {/* Moving Grid Floor */}
            <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
                <gridHelper args={[100, 50, "#ff00ff", "#220033"]} position={[0, 0, 0]} />
                <gridHelper args={[100, 50, "#ff00ff", "#220033"]} position={[0, 0.1, -50]} /> {/* Extend */}
            </group>

            {/* Stars */}
            <Stars />
        </group>
    );
}

function Stars() {
    const count = 500;
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 100; // x
            pos[i * 3 + 1] = (Math.random() - 0.5) * 50;  // y
            pos[i * 3 + 2] = -25 - Math.random() * 20; // z
        }
        return pos;
    }, []);

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial size={0.2} color="white" transparent opacity={0.8} />
        </points>
    )
}


// --- Main Scene ---
export default function GameScene({ p1Type, p2Type }: { p1Type: EntityType, p2Type: EntityType }) {
    const engineRef = useRef<GameEngine | null>(null);
    const inputRef = useRef<Set<string>>(new Set());
    const [gameState, setGameState] = useState<GameState | null>(null);

    // Init Engine
    useEffect(() => {
        const engine = new GameEngine(p1Type, p2Type);
        engineRef.current = engine;
        setGameState({ ...engine.state });

        const handleKeyDown = (e: KeyboardEvent) => inputRef.current.add(e.code);
        const handleKeyUp = (e: KeyboardEvent) => inputRef.current.delete(e.code);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        // Game Loop Interval (Physics)
        const interval = setInterval(() => {
            engine.update(0.016, inputRef.current);
            // Sync React state for HUD (throttled)
            // We'll trust R3F useFrame for rendering, but we need state for HUD
            // Let's just update HUD every frame for now, optimization later
        }, 16);

        // HUD Loop
        const hudInterval = setInterval(() => {
            setGameState({ ...engine.state });
        }, 30);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            clearInterval(interval);
            clearInterval(hudInterval);
        };
    }, [p1Type, p2Type]);

    if (!gameState) return <div className="text-white">Loading Arena...</div>;

    return (
        <div className="relative w-full h-full bg-black">
            <Canvas
                camera={{ position: [0, 0, 15], fov: 60 }}
                gl={{ antialias: false, toneMapping: THREE.ReinhardToneMapping, toneMappingExposure: 1.5 }}
            >
                <color attach="background" args={["#050510"]} />

                {/* Lights */}
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} color="#00f0ff" />
                <pointLight position={[-10, 10, 10]} intensity={1} color="#bd00ff" />

                {/* Content */}
                <SynthwaveEnv />
                {engineRef.current && <GameEntities engine={engineRef.current} />}

                {/* Post Processing */}
                <EffectComposer enableNormalPass={false}>
                    <Bloom luminanceThreshold={0.5} mipmapBlur intensity={2.0} radius={0.4} />
                    <ChromaticAberration offset={[0.002, 0.002] as any} />
                </EffectComposer>
            </Canvas>

            {/* HUD Overlay */}
            <HUD state={gameState} />
        </div>
    );
}

// Reuse HUD from previous file (copy-paste for now to keep self-contained or import)
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
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between text-white font-orbitron pointer-events-none">
            {/* P1 */}
            <div className="flex flex-col gap-2">
                <HealthBar current={state.player1.health} max={state.player1.maxHealth} color="bg-cyan-500" />
                <div className="text-xs text-cyan-300">TITAN HP</div>
                <HealthBar current={state.titan1.health} max={state.titan1.maxHealth} color="bg-cyan-800" />
            </div>
            {/* P2 */}
            <div className="flex flex-col gap-2 items-end">
                <HealthBar current={state.player2.health} max={state.player2.maxHealth} color="bg-purple-500" />
                <div className="text-xs text-purple-300">TITAN HP</div>
                <HealthBar current={state.titan2.health} max={state.titan2.maxHealth} color="bg-purple-800" />
            </div>
        </div>
    );
}

function HealthBar({ current, max, color }: { current: number, max: number, color: string }) {
    const pct = Math.max(0, (current / max) * 100);
    return (
        <div className="w-64 h-4 bg-gray-900 border border-gray-600 skew-x-[-15deg] overflow-hidden">
            <div className={cn("h-full transition-all duration-200 box-glow", color)} style={{ width: `${pct}%` }} />
        </div>
    );
}
