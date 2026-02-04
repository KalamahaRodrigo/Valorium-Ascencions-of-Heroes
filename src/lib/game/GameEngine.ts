import { Player, Titan, Lane, EntityType } from './Entities';

export interface GameState {
    player1: Player;
    player2: Player;
    titan1: Titan;
    titan2: Titan;
    winner: number | null;
    hitStop: number; // Global freeze frames for impact
    timer: number; // Round Timer (seconds)
}

export class GameEngine {
    state: GameState;

    // Low Res Coordinate Space (Pixel Art)
    width: number = 320;
    height: number = 180;

    // Physics Constants
    GRAVITY: number = 800; // Pixels per second squared
    JUMP_FORCE: number = -250;

    // Input Buffers (Track last input time)
    p1Buffer: { key: string, time: number }[] = [];
    p2Buffer: { key: string, time: number }[] = [];

    constructor(p1Type: EntityType = 'SAMURAI', p2Type: EntityType = 'SAMURAI') {
        this.state = this.initGame(p1Type, p2Type);
    }

    initGame(p1Type: EntityType, p2Type: EntityType): GameState {
        const groundY = 150; // Low res ground

        // Titans
        const titan1 = new Titan(20, groundY - 80, '#007077');
        const titan2 = new Titan(200, groundY - 80, '#8800bb');
        titan2.facingRight = false;

        // Players
        const p1 = new Player(1, 40, groundY - 40, '#00f0ff', p1Type);
        const p2 = new Player(2, 260, groundY - 40, '#bd00ff', p2Type);
        p2.facingRight = false;

        return {
            player1: p1,
            player2: p2,
            titan1: titan1,
            titan2: titan2,
            winner: null,
            hitStop: 0,
            timer: 99
        };
    }

    update(dt: number, inputs: Set<string>) {
        if (this.state.winner) return;

        // Global Timer Tick
        if (this.state.timer > 0) {
            // Very rough timer approximation (dt is seconds) - only update integer timer part occasionally or just sub dt
            // Let's store timer as float in state but display int
            this.state.timer -= dt;
            if (this.state.timer < 0) this.state.timer = 0;
        } else {
            // Time Over - Decide Winner by Health
            if (this.state.player1.health > this.state.player2.health) this.state.winner = 1;
            else if (this.state.player2.health > this.state.player1.health) this.state.winner = 2;
            else this.state.winner = 0; // Draw
            return;
        }

        // Hit Stop (Freeze frame for impact)
        if (this.state.hitStop > 0) {
            this.state.hitStop -= 1; // Decrement frame (assuming 60fps update call)
            return;
        }

        const { player1, player2, titan1, titan2 } = this.state;
        const speed = 60; // Slower logical speed for pixel feel

        // Coordinates for Lanes
        const laneY_FG = 150 - 40;
        const laneY_BG = 100 - 30;
        const scale_BG = 0.8;

        // --- Helper: Track Inputs for Specials ---
        const updateInputBuffer = (buffer: { key: string, time: number }[], inputs: Set<string>) => {
            const now = Date.now();
            // This is a naive polling check. Ideally we'd use event listeners pushing to a queue.
            // But since we receive "inputs" Set every frame, we can detect RISING EDGE.
            // For now, let's keep it simple: detecting specific sequences is hard with just Set<string> polling without prev frame state.
            // Let's rely on standard inputs for now.

            // Actually, 'inputs' is real-time held keys. We need "Just Pressed".
            // We will assume the React side handles keydown events pushing to a queue if valid.
            // But here we only get the set. 
            // Let's try to detect sequence "Forward, Forward" by checking state flags or just keeping it simple for now.
            // USER REQUEST: "Double Forward + Attack".
            // We'll implement a simple cooldown based dash/special check logic later if needed.
        };

        // --- Helper: Handle Player ---
        const handlePlayer = (p: Player, left: string, right: string, up: string, down: string, atk: string, heal: string, jump: string, switchLane: string, isP1: boolean) => {
            const enemy = isP1 ? player2 : player1;
            p.isBlocking = false; // Reset block

            // Ground Level for current lane
            const currentGroundY = p.lane === 'BACKGROUND' ? laneY_BG : laneY_FG;
            const isGrounded = p.y >= currentGroundY;

            // Movement X
            if (inputs.has(left)) {
                p.vx = -speed;
                // Block if enemy is to Left and we hold right? No, standard fighting game: Hold BACK.
                if (p.facingRight && inputs.has(left)) p.isBlocking = true;
            } else if (inputs.has(right)) {
                p.vx = speed;
                if (!p.facingRight && inputs.has(right)) p.isBlocking = true;
            } else {
                p.vx = 0;
            }

            // Jump (Only if grounded)
            if (inputs.has(jump) && isGrounded) {
                // p.vy is needed on Player class. Let's cast for now or update class later.
                (p as any).vy = this.JUMP_FORCE;
            }

            // Gravity
            if (!isGrounded || (p as any).vy < 0) {
                (p as any).vy = ((p as any).vy || 0) + this.GRAVITY * dt;
                p.y += (p as any).vy * dt;
            } else {
                (p as any).vy = 0;
                p.y = currentGroundY; // Snap to floor
            }

            // Auto-Face Enemy
            if (p.x < enemy.x) p.facingRight = true;
            else p.facingRight = false;


            // Lane Switching (Dedicated Button)
            // Debounce needed for lane switch to prevent rapid toggling
            if (inputs.has(switchLane) && !(p as any).laneSwitchCooldown) {
                if (p.lane === 'FOREGROUND') {
                    p.lane = 'BACKGROUND';
                    p.y = laneY_BG; // Instant snap for now, visual lerp later
                    p.width = 20 * scale_BG;
                    p.height = 40 * scale_BG;
                } else {
                    p.lane = 'FOREGROUND';
                    p.y = laneY_FG;
                    p.width = 20;
                    p.height = 40;
                }
                (p as any).laneSwitchCooldown = 20; // Frames
            }
            if ((p as any).laneSwitchCooldown > 0) (p as any).laneSwitchCooldown--;


            // Special Attack (Charge Logic)
            // Passive charge? Or by attacking? Let's say by attacking/taking damage.
            // User Request: "Blast animation... Double Forward + Attack when full"

            // Combat
            if (inputs.has(atk) && !p.isAttacking) {
                p.isAttacking = true;
                setTimeout(() => p.isAttacking = false, 300);

                // Check Special (Mock "Double Forward" check - requires simplified logic here)
                // If bar full (100) -> Unleash
                if ((p as any).specialMeter >= 100) {
                    // Trigger Special
                    (p as any).specialMeter = 0;
                    // Explosion Logic (Hit all lane enemies)
                    const enemies = isP1 ? [player2, titan2] : [player1, titan1];
                    enemies.forEach(target => {
                        if (target.lane === p.lane && Math.abs(target.x - p.x) < 150) { // Large range
                            target.takeDamage(60); // huge damage
                            this.state.hitStop = 20;
                        }
                    });
                    // Add Visual Flag
                    (p as any).isUsingSpecial = true;
                    setTimeout(() => (p as any).isUsingSpecial = false, 1000);
                    return;
                }

                // Normal Hit logic
                const enemies = isP1 ? [player2, titan2] : [player1, titan1];
                enemies.forEach(target => {
                    if (target.lane === p.lane && p.collidesWith(target) && !target.isDead) {
                        const dmg = 10; // Reduced Damage (was 40)
                        target.takeDamage(dmg);

                        // Meter Gain
                        (p as any).specialMeter = Math.min(100, ((p as any).specialMeter || 0) + 10);

                        this.state.hitStop = 5;
                    }
                });
            }
        };

        // Process Inputs
        // P1: W=Jump, E=Switch Lane, Space=Attack
        handlePlayer(player1, 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyQ', 'KeyW', 'KeyE', true);
        // P2: Up=Jump, Shift=Switch, Enter=Attack
        handlePlayer(player2, 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'ShiftRight', 'ArrowUp', 'ShiftRight', false);

        // Apply physics boundaries
        [player1, player2].forEach(p => {
            // p.update(dt) handled manually above for gravity integration
            if (p.x < 0) p.x = 0;
            if (p.x > this.width - p.width) p.x = this.width - p.width;

            // Floor Collision Clamp if falling (already handled in gravity block, but safety check)
            const currentGroundY = p.lane === 'BACKGROUND' ? laneY_BG : laneY_FG;
            if (p.y > currentGroundY) {
                p.y = currentGroundY;
                (p as any).vy = 0;
            }
        });

        // Titan Logic
        const fightRange = 60;
        const dist = Math.abs(titan1.x - titan2.x);

        // Scale Titans
        titan1.width = 60; titan1.height = 100;
        titan2.width = 60; titan2.height = 100;
        titan1.y = 80;
        titan2.y = 80;

        if (!titan1.isDead && !titan2.isDead) {
            if (dist > fightRange) {
                titan1.vx = 10;
                titan2.vx = -10;
            } else {
                titan1.vx = 0;
                titan2.vx = 0;
                // Big Titan Clashes
                if (Math.random() < 0.01) {
                    titan2.takeDamage(50);
                    this.state.hitStop = 5; // Mini shake
                }
                if (Math.random() < 0.01) {
                    titan1.takeDamage(50);
                    this.state.hitStop = 5;
                }
            }
        } else {
            titan1.vx = 0; titan2.vx = 0;
        }

        titan1.update(dt);
        titan2.update(dt);

        // Win Logic
        if ((player2.isDead && titan2.isDead) || this.state.timer <= 0) {
            // Redundant check, handled by timer or death
            if (player2.isDead && titan2.isDead) this.state.winner = 1;
            else if (player1.isDead && titan1.isDead) this.state.winner = 2;
        }
    }
}
