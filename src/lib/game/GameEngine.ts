import { Player, Titan, Lane, EntityType, Orb } from './Entities';

export interface GameState {
    player1: Player;
    player2: Player;
    titan1: Titan;
    titan2: Titan;
    orb1: Orb;
    orb2: Orb;
    winner: number | null;
    hitStop: number; // Global freeze frames for impact
    titanCharging: number; // 0 = not charging, 1 = titan1 charging, 2 = titan2 charging
    titanChargeTimer: number; // Seconds remaining for charge charge
    lastHitPos?: { x: number, y: number }; // Coordinate of the last valid hit for VFX
    lastHitType?: 'BLADE' | 'HANDLE' | 'SPECIAL' | 'TITAN_DEATH'; // Type of the last hit
    lastAttackerId?: string; // 'P1', 'P2', 'TITAN', 'WORLD'
    titan1DeadHandled?: boolean; // Track if death event has been processed
    titan2DeadHandled?: boolean;
}

export class GameEngine {
    state: GameState;

    // Low Res Coordinate Space (Pixel Art)
    width: number = 320;
    height: number = 180;

    // Physics Constants
    GRAVITY: number = 800; // Pixels per second squared
    JUMP_FORCE: number = -250;

    // Weapon Stats (Rebalanced with hitbox zones)
    // minRange: dead zone at the handle (no damage), maxRange: weapon tip
    static WEAPON_STATS: Record<EntityType, { range: number; minRange: number; damage: number; cooldown: number; startup: number }> = {
        SAMURAI: { range: 45, minRange: 20, damage: 8, cooldown: 0.35, startup: 0.1 },   // Katana: Reduced range (50->45) but fixed hitbox tip
        NINJA: { range: 48, minRange: 25, damage: 12, cooldown: 0.6, startup: 0.2 },      // Spear: Range reduced (55->48) per user request
        MONK: { range: 45, minRange: 20, damage: 18, cooldown: 0.9, startup: 0.3 },       // Axe: 20px Handle, 25px Head (Larger sweet spot inside)
        TITAN: { range: 80, minRange: 10, damage: 50, cooldown: 1.5, startup: 0.5 },
    };

    // Input Buffers (Track last input time)
    p1Buffer: { key: string, time: number }[] = [];
    p2Buffer: { key: string, time: number }[] = [];

    constructor(p1Type: EntityType = 'SAMURAI', p2Type: EntityType = 'SAMURAI') {
        this.state = this.initGame(p1Type, p2Type);
    }

    initGame(p1Type: EntityType, p2Type: EntityType): GameState {
        const groundY = 150; // Low res ground

        // Titans - Centered starting positions
        // BG Ground is at Y=100 (approx). Titan Height = 90 (to look big but distant).
        // Y = 100 - 90 = 10.
        // Center of screen is 160, each titan starts equidistant from center
        const titan1 = new Titan(60, 10, '#007077');  // Left titan, moved right for better centering
        const titan2 = new Titan(200, 10, '#8800bb'); // Right titan
        titan2.facingRight = false;

        // Players
        const p1 = new Player(1, 40, groundY - 40, '#00f0ff', p1Type);
        const p2 = new Player(2, 260, groundY - 40, '#bd00ff', p2Type);
        p2.facingRight = false;

        // Orbs at each end of FOREGROUND lane
        const orb1 = new Orb(10, groundY - 15, 1); // Left side, P1's orb
        const orb2 = new Orb(295, groundY - 15, 2); // Right side, P2's orb

        return {
            player1: p1,
            player2: p2,
            titan1: titan1,
            titan2: titan2,
            orb1: orb1,
            orb2: orb2,
            winner: null,
            hitStop: 0,
            titanCharging: 0,
            titanChargeTimer: 0
        };
    }

    update(dt: number, inputs: Set<string>) {
        if (this.state.winner) return;


        // No timer - game ends when an orb is destroyed

        // Hit Stop (Freeze frame for impact)
        if (this.state.hitStop > 0) {
            this.state.hitStop -= 1; // Decrement frame (assuming 60fps update call)
            return;
        }

        const { player1, player2, titan1, titan2, orb1, orb2 } = this.state;
        const speed = 60; // Slower logical speed for pixel feel

        // Coordinates for Lanes
        const laneY_FG = 150 - 40;
        const laneY_BG = 100 - 30;
        const scale_BG = 0.8;

        // --- RESPAWN SYSTEM ---
        // Handle Player 1 Respawn
        if (player1.isRespawning) {
            player1.respawnTimer -= dt;
            player1.deathAnimFrame++;
            // Activate defense bonus on orb (non-cumulative)
            orb1.activateDefenseBonus();

            if (player1.respawnTimer <= 0) {
                player1.respawn(orb1.x, orb1.y, laneY_FG);
                // Permanent bonus: orb1.hasDefenseBonus remains true
            }
        }

        // Handle Player 1 Resurrection Animation
        if (player1.isResurrecting) {
            player1.resurrectionAnimFrame++;
            if (player1.resurrectionAnimFrame >= 60) { // 1 second animation
                player1.isResurrecting = false;
            }
        }

        // Handle Player 2 Respawn
        if (player2.isRespawning) {
            player2.respawnTimer -= dt;
            player2.deathAnimFrame++;
            // Activate defense bonus on orb (non-cumulative)
            orb2.activateDefenseBonus();

            if (player2.respawnTimer <= 0) {
                player2.respawn(orb2.x, orb2.y, laneY_FG);
                // Permanent bonus: orb2.hasDefenseBonus remains true
            }
        }

        // Handle Player 2 Resurrection Animation
        if (player2.isResurrecting) {
            player2.resurrectionAnimFrame++;
            if (player2.resurrectionAnimFrame >= 60) { // 1 second animation
                player2.isResurrecting = false;
            }
        }

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
            // Skip processing for dead or respawning players
            if (p.isDead || p.isRespawning) return;

            const enemy = isP1 ? player2 : player1;
            const stats = GameEngine.WEAPON_STATS[p.classType];

            p.isBlocking = false; // Reset block

            // Track lane sync for defense cooldown
            const wasInSameLane = (p as any).wasInSameLane ?? false;
            const isInSameLane = p.lane === enemy.lane;

            // Reset defense cooldown when entering same lane
            if (isInSameLane && !wasInSameLane) {
                (p as any).defenseActivationCooldown = 30; // 0.5s at 60fps
            }
            (p as any).wasInSameLane = isInSameLane;

            // Decrement defense activation cooldown
            if ((p as any).defenseActivationCooldown > 0) {
                (p as any).defenseActivationCooldown--;
            }

            // Can only block if: same lane as enemy AND cooldown expired
            const canBlock = isInSameLane && ((p as any).defenseActivationCooldown ?? 0) <= 0;

            // Cooldown Management
            if (p.attackCooldown > 0) p.attackCooldown -= dt;

            // Ground Level for current lane
            const currentGroundY = p.lane === 'BACKGROUND' ? laneY_BG : laneY_FG;
            const isGrounded = p.y >= currentGroundY;

            // Movement X
            if (inputs.has(left)) {
                // Movement Left
                if (!p.isCrouching) p.vx = -speed;
                p.facingRight = false;

                // Block Check: If Enemy is to the RIGHT, holding LEFT means blocking
                if (canBlock && enemy.x > p.x && inputs.has(left)) p.isBlocking = true;

            } else if (inputs.has(right)) {
                // Movement Right
                if (!p.isCrouching) p.vx = speed;
                p.facingRight = true;

                // Block Check: If Enemy is to the LEFT, holding RIGHT means blocking
                if (canBlock && enemy.x < p.x && inputs.has(right)) p.isBlocking = true;
            } else {
                p.vx = 0;
            }

            // Apply Horizontal Movement
            p.x += p.vx * dt;

            // Crouch
            if (inputs.has(down) && isGrounded) {
                p.isCrouching = true;
                // Reduce height/hitbox if needed, or just visual state
                // p.height = 40; // Example
            } else {
                p.isCrouching = false;
                // p.height = 60;
            }

            // Jump (Only if grounded and not crouching)
            if (inputs.has(jump) && isGrounded && !p.isCrouching) {
                p.vy = this.JUMP_FORCE;
            }

            // Gravity
            if (!isGrounded || p.vy < 0) {
                p.vy = (p.vy || 0) + this.GRAVITY * dt;
                p.y += p.vy * dt;
            } else {
                p.vy = 0;
                p.y = currentGroundY; // Snap to floor
            }

            // Direction is now manual (set by movement keys above)


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
            // Requirement: No continuous attack (must release key)
            // Ideally we track "wasPressed" but simple check:
            // We need a flag "canAttack" that resets when key is released.
            // Let's use a property on Player: `hasReleasedAttack` logic or similar.
            // Simplified: If input has ATK, and cooldown <= 0, and NOT already attacking...
            // But to prevent hold, we need to know if it's a NEW press. 
            // Since we poll `inputs`, we'll check: if (inputs.has(atk) && !p.lastFrameAtkPressed && cooldown <= 0)

            const isAtkPressed = inputs.has(atk);

            if (isAtkPressed && !(p as any).lastFrameAtkPressed && p.attackCooldown <= 0 && !p.isAttacking) {
                p.isAttacking = true;
                p.hitTargets.clear(); // Reset hit tracking for new swing
                p.attackCooldown = stats.cooldown;

                // Visual duration match startup + minimal active frames (e.g. 0.2s)
                setTimeout(() => p.isAttacking = false, 200);

                // Check Special (Mock "Double Forward" check - requires simplified logic here)
                // If bar full (100) -> Unleash
                // Check Special (Mock "Double Forward" check - requires simplified logic here)
                // If bar full (100) -> Unleash
                if (p.specialMeter >= 100) {
                    // Start Special Animation sequence
                    p.specialMeter = 0;
                    p.isUsingSpecial = true;
                    p.specialFrame = 0; // Reset frame counter

                    // We DO NOT deal damage here anymore. 
                    // It happens in the per-frame update below via specialFrame check.

                    (p as any).lastFrameAtkPressed = isAtkPressed; // Set for next frame
                    return;
                }

                // Normal Hit logic
                const enemies = isP1 ? [player2, titan2] : [player1, titan1];
                const targetOrb = isP1 ? this.state.orb2 : this.state.orb1;

                enemies.forEach(target => {
                    // Ignore already hit targets for this swing
                    if (p.hitTargets.has(target)) return;

                    // --- COMPONENT-BASED HITBOX SYSTEM (Handle vs Blade) ---

                    const centerX = p.x + p.width / 2;
                    const centerY = p.y;

                    // Helper to get AABB for a range segment relative to player center
                    const getHitboxSegment = (startOffset: number, length: number) => {
                        const hitX = p.facingRight
                            ? centerX + startOffset
                            : centerX - startOffset - length;

                        return {
                            x: hitX,
                            y: centerY + 10,
                            w: length,
                            h: p.height - 20
                        };
                    };

                    // 1. Define Zones
                    // Handle Zone: From center (plus small gap) to start of blade
                    // Blade Zone: From start of blade to max range
                    const isBG = p.lane === 'BACKGROUND';
                    const scale = isBG ? 0.8 : 1.0;

                    const bladeStart = stats.minRange * scale;
                    let bladeLength = (stats.range - stats.minRange) * scale;

                    // Fix geometric gap between hitbox and visual tip (aligns hitbox to visual edge + small phantom range)
                    // User Request: Replicate the "filled tip" feel for Spear and Axe as well.
                    if (['SAMURAI', 'NINJA', 'MONK'].includes(p.classType)) {
                        bladeLength += (10 * scale);
                    }

                    // Handle simulated slightly in front of body (e.g., 2px) to prevent self-hitting or weird overlaps
                    // Handle length = minRange - 2. If minRange is small (Katana), handle is tiny.
                    const handleStart = 2 * scale;
                    const handleLength = Math.max(0, bladeStart - (2 * scale));

                    const bladeBox = getHitboxSegment(bladeStart, bladeLength);
                    const handleBox = getHitboxSegment(handleStart, handleLength);

                    // 2. Target Box
                    const targetBox = { x: target.x, y: target.y, w: target.width, h: target.height };

                    // 3. Check Overlap & Calculate Intersection
                    const getIntersection = (r1: any, r2: any) => {
                        const x1 = Math.max(r1.x, r2.x);
                        const y1 = Math.max(r1.y, r2.y);
                        const x2 = Math.min(r1.x + r1.w, r2.x + r2.w);
                        const y2 = Math.min(r1.y + r1.h, r2.y + r2.h);

                        if (x2 < x1 || y2 < y1) return null; // No overlap
                        return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }; // Return center of intersection
                    };

                    // HANDLE PRIORITY: Check Handle first. If it hits, it jams the attack (Sour Spot).
                    const handleHitCenter = getIntersection(handleBox, targetBox);
                    const bladeHitCenter = !handleHitCenter ? getIntersection(bladeBox, targetBox) : null;

                    const hitHandle = !!handleHitCenter;
                    const hitBlade = !!bladeHitCenter;

                    // 4. Resolve Hit
                    // Valid Lane Check: MUST be in same lane to hit, even for Titans
                    const validLane = p.lane === target.lane;

                    // DEAD ZONE LOGIC:
                    // - Blade hits: Valid.
                    // - Handle hits: By default IGNORED (Dead zone/Miss).
                    // - Titan Exception: Titans are huge, so any hit (Blade or Handle) counts as a Blade hit.
                    const isEffectiveHit = hitBlade || (hitHandle && target.classType === 'TITAN');

                    if (isEffectiveHit && validLane && !target.isDead) {
                        p.hitTargets.add(target); // MARK AS HIT

                        // Record precise hit position for VFX
                        this.state.lastHitPos = bladeHitCenter || handleHitCenter || { x: target.x, y: target.y };

                        // Calculate Damage Multiplier
                        const enemyPlayer = isP1 ? player2 : player1;
                        let multiplier = enemyPlayer.isDead ? 3 : 1;

                        // Titan Defense (both players in BG) - Logic still applies if p.lane is BG (which it must be now)
                        if (target.classType === 'TITAN' && player1.lane === 'BACKGROUND' && player2.lane === 'BACKGROUND') {
                            multiplier *= 0.5;
                        }

                        // Titan Combo Scaling
                        if (target.classType === 'TITAN') {
                            const titanComboKey = isP1 ? 'p1TitanCombo' : 'p2TitanCombo';
                            const titanCooldownKey = isP1 ? 'p1TitanComboCooldown' : 'p2TitanComboCooldown';
                            if ((this.state as any)[titanCooldownKey] && Date.now() < (this.state as any)[titanCooldownKey]) {
                                (this.state as any)[titanComboKey] = 0;
                            } else {
                                (this.state as any)[titanComboKey] = Math.min(10, ((this.state as any)[titanComboKey] || 0) + 1);
                            }
                            const titanComboHits = (this.state as any)[titanComboKey] || 0;
                            multiplier *= (1 + (titanComboHits * 0.4));

                            // TITAN ABSORPTION MECHANIC (GRADUAL):
                            // Defense scales with proximityCharge (0% to 50%)
                            const titanTarget = target as Titan;
                            if (titanTarget.proximityCharge > 0) {
                                const defenseBonus = titanTarget.proximityCharge * 0.5; // Max 0.5 (50%)
                                multiplier *= (1 - defenseBonus);
                            }
                        }

                        // --- DAMAGE LOGIC ---
                        // Since we only enter here for Effective Hits, it's always Full Damage.
                        let finalDamage = stats.damage * multiplier;
                        this.state.hitStop = 5; // Heavy hit feel
                        this.state.lastHitType = 'BLADE';
                        this.state.lastAttackerId = isP1 ? 'P1' : 'P2';

                        target.takeDamage(finalDamage);
                        p.specialMeter = Math.min(100, (p.specialMeter || 0) + 10);
                    }
                });

                // Attack Orb (allow attack even if shielded - handles partial damage internally)
                if (p.lane === 'FOREGROUND' && !targetOrb.isDead) {
                    // Ignore if already hit in this swing
                    if (p.hitTargets.has(targetOrb)) return;

                    // FIX: center1 -> centerX
                    const centerX = p.x + p.width / 2;
                    const centerY = p.y;

                    const getHitboxSegment = (startOffset: number, length: number) => {
                        const hitX = p.facingRight ? centerX + startOffset : centerX - startOffset - length;
                        return { x: hitX, y: centerY + 10, w: length, h: p.height - 20 };
                    };

                    const bladeBox = getHitboxSegment(stats.minRange, stats.range - stats.minRange);
                    const orbBox = { x: targetOrb.x, y: targetOrb.y, w: targetOrb.width, h: targetOrb.height };

                    const checkOverlap = (r1: any, r2: any) => {
                        return (r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y);
                    };

                    if (checkOverlap(bladeBox, orbBox)) {
                        // Calculate intersection for VFX
                        const x1 = Math.max(bladeBox.x, orbBox.x);
                        const y1 = Math.max(bladeBox.y, orbBox.y);
                        const x2 = Math.min(bladeBox.x + bladeBox.w, orbBox.x + orbBox.w);
                        const y2 = Math.min(bladeBox.y + bladeBox.h, orbBox.y + orbBox.h);
                        this.state.lastHitPos = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };

                        p.hitTargets.add(targetOrb); // MARK AS HIT

                        // Base damage multiplier (independent of titan/player status)
                        // User request: Reduce player damage to orb by at least 20%
                        let dmgMultiplier = 0.8;

                        // Reduce damage to Orb if both players in FOREGROUND
                        if (player1.lane === 'FOREGROUND' && player2.lane === 'FOREGROUND') {
                            dmgMultiplier *= 0.5; // 50% damage reduction
                        }

                        // *** ORB PROTECTION: Defender absorbs 75% damage when near their orb ***
                        const defender = isP1 ? player2 : player1;
                        const defenderOrb = isP1 ? this.state.orb2 : this.state.orb1;
                        const defenderDist = Math.abs((defender.x + defender.width / 2) - (defenderOrb.x + defenderOrb.width / 2));
                        const protectionRange = 50; // Player must be within 50px of orb center

                        if (defenderDist < protectionRange && defender.lane === 'FOREGROUND' && !defender.isDead) {
                            dmgMultiplier *= 0.25; // Defender absorbs 75% of damage
                        }

                        // Consecutive hit damage scaling (up to 3x)
                        // Reset when opponent returns to same lane, 4s cooldown to reactivate
                        const orbKey = isP1 ? 'p1OrbCombo' : 'p2OrbCombo';
                        const cooldownKey = isP1 ? 'p1OrbComboCooldown' : 'p2OrbComboCooldown';

                        // Check if combo is on cooldown
                        if ((this.state as any)[cooldownKey] && Date.now() < (this.state as any)[cooldownKey]) {
                            // Cooldown active - no combo bonus
                            (this.state as any)[orbKey] = 0;
                        } else {
                            // Increment combo (max 10 hits for 3x = 1 + 0.2 per hit)
                            (this.state as any)[orbKey] = Math.min(10, ((this.state as any)[orbKey] || 0) + 1);
                        }

                        const comboHits = (this.state as any)[orbKey] || 0;
                        const comboMultiplier = 1 + (comboHits * 1.0); // 1x to 11x over 10 hits - VERY alarming!

                        this.state.lastAttackerId = isP1 ? 'P1' : 'P2';
                        const targetTitan = isP1 ? titan2 : titan1;

                        targetOrb.takeDamage(
                            stats.damage * 5 * dmgMultiplier * comboMultiplier,
                            false, // isSpecial? No
                            targetTitan.isDead // canPierce? Yes if titan is dead
                        );
                    }
                }

                // Reset orb combo when opponent returns to same lane (different player attacking)
                const selfOrbKey = isP1 ? 'p2OrbCombo' : 'p1OrbCombo';
                const selfCooldownKey = isP1 ? 'p2OrbComboCooldown' : 'p1OrbComboCooldown';
                if (p.lane === enemy.lane && (this.state as any)[selfOrbKey] > 0) {
                    (this.state as any)[selfOrbKey] = 0;
                    (this.state as any)[selfCooldownKey] = Date.now() + 4000; // 4s cooldown
                }

                // Reset Titan combo when enemy returns to same lane
                const selfTitanComboKey = isP1 ? 'p2TitanCombo' : 'p1TitanCombo';
                const selfTitanCooldownKey = isP1 ? 'p2TitanComboCooldown' : 'p1TitanComboCooldown';
                if (p.lane === enemy.lane && (this.state as any)[selfTitanComboKey] > 0) {
                    (this.state as any)[selfTitanComboKey] = 0;
                    (this.state as any)[selfTitanCooldownKey] = Date.now() + 4000; // 4s cooldown
                }
            }

            (p as any).lastFrameAtkPressed = isAtkPressed;

            // --- Update Special Attack State ---
            if (p.isUsingSpecial) {
                p.specialFrame++;

                // Trigger Damage at specific frame (Charge Complete)
                // Frame 15 (approx 0.25s @ 60fps)
                if (p.specialFrame === 15) {
                    const enemies = isP1 ? [player2, titan2] : [player1, titan1];
                    let hitAny = false;

                    // Calculate weapon tip position (where the energy ball ends)
                    const dir = p.facingRight ? 1 : -1;
                    const playerCenter = p.x + p.width / 2;
                    const tipDistance = 60; // Same as maxDist in visuals
                    const tipX = playerCenter + (tipDistance * dir);
                    const tipY = p.y + p.height / 2;
                    const hitRadius = 30; // Small hitbox at the tip

                    enemies.forEach(target => {
                        if (target.lane !== p.lane) return;

                        // Check if target center is within hitRadius of the tip
                        const targetCenterX = target.x + target.width / 2;
                        const targetCenterY = target.y + target.height / 2;
                        const dx = targetCenterX - tipX;
                        const dy = targetCenterY - tipY;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance < hitRadius + target.width / 2) {
                            target.takeDamage(60); // huge damage
                            hitAny = true;
                        }
                    });

                    // Special attack can also hit orb (with partial vulnerability)
                    const targetOrb = isP1 ? this.state.orb2 : this.state.orb1;
                    if (p.lane === 'FOREGROUND') {
                        const orbCenterX = targetOrb.x + targetOrb.width / 2;
                        const orbCenterY = targetOrb.y + targetOrb.height / 2;
                        const dx = orbCenterX - tipX;
                        const dy = orbCenterY - tipY;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance < hitRadius + targetOrb.width && !targetOrb.isDead) {
                            let damage = 48;

                            // LATE GAME BALANCE: Break stalemate
                            // If all defenses are active (Defense Bonus + High Regen from Dead Titan)
                            // AND opponent is actually on field (not respawning), triple the damage.
                            const opponent = isP1 ? player2 : player1;
                            const targetTitan = isP1 ? titan2 : titan1;

                            if (targetOrb.hasDefenseBonus && targetTitan.isDead && !opponent.isRespawning) {
                                damage *= 3; // 48 -> 144
                            }

                            targetOrb.takeDamage(damage, true, targetTitan.isDead); // isSpecial=true, canPierce=TitanDead
                            hitAny = true;
                        }
                    }

                    if (hitAny) {
                        this.state.hitStop = 20; // Big freeze
                        this.state.lastHitPos = { x: tipX, y: tipY };
                        this.state.lastHitType = 'SPECIAL';
                        this.state.lastAttackerId = isP1 ? 'P1' : 'P2';
                    }
                }

                // End Special Sequence
                if (p.specialFrame >= 30) { // 0.5 second total visual duration
                    p.isUsingSpecial = false;
                    p.specialFrame = 0;
                }
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

        // Scale Titans (Visual adjustment)
        titan1.width = 60; titan1.height = 90;
        titan2.width = 60; titan2.height = 90;


        // Update orb shields based on Titan status
        orb1.isShielded = !titan1.isDead;
        orb2.isShielded = !titan2.isDead;

        // Update Titan Defense Charge (Proximity to Player)
        const updateTitanCharge = (titan: Titan, player: Player) => {
            if (titan.isDead) return;

            // Lane Restriction: Must be in Lane 2 (BACKGROUND) to charge
            if (player.lane !== 'BACKGROUND') {
                titan.proximityCharge = 0; // Instant reset if leaving lane
                return;
            }

            // FIX: Use center-to-center distance for symmetric behavior
            const titanCenter = titan.x + titan.width / 2;
            const playerCenter = player.x + player.width / 2;
            const dist = Math.abs(titanCenter - playerCenter);

            // Proximity Restriction: Must be touching/very close (< 70px center-to-center)
            // Adjusted from 90 (edge-to-edge approx) to 70 (center-to-center) to match P2's previous feel
            if (dist < 70 && !player.isDead && !player.isRespawning) {
                // Charge up: 3 seconds to full (0 to 1)
                titan.proximityCharge = Math.min(1, titan.proximityCharge + dt / 3);
            } else {
                // Decay: 1 second to empty if active but moving away
                titan.proximityCharge = Math.max(0, titan.proximityCharge - dt);
            }
        };
        updateTitanCharge(titan1, player1);
        updateTitanCharge(titan2, player2);

        // Passive Regeneration up to 35% Health (User Request)
        // Helps Titans recover from critical state during long fights
        const criticalThreshold = 0.35;
        const baseRegenRate = 8; // HP per second

        // Helper to calculate dynamic regen based on time since last damage
        const getDynamicRegen = (titan: Titan) => {
            const timeSinceHit = (Date.now() - titan.lastDamageTime) / 1000; // in seconds
            if (timeSinceHit > 20) return baseRegenRate * 4; // 32 HP/s
            if (timeSinceHit > 5) return baseRegenRate * 2; // 16 HP/s
            return baseRegenRate; // 8 HP/s
        };

        if (!titan1.isDead && titan2.isDead && titan1.health < titan1.maxHealth * criticalThreshold) {
            const rate = getDynamicRegen(titan1);
            titan1.health = Math.min(titan1.maxHealth * criticalThreshold, titan1.health + (rate * dt));
        }
        if (!titan2.isDead && titan1.isDead && titan2.health < titan2.maxHealth * criticalThreshold) {
            const rate = getDynamicRegen(titan2);
            titan2.health = Math.min(titan2.maxHealth * criticalThreshold, titan2.health + (rate * dt));
        }

        // Check for Titan Death & "Second Wind" Mechanic
        // If a Titan dies, the survivor heals 35% max HP if they are critical (<35%)
        if (titan1.isDead && !this.state.titan1DeadHandled) {
            this.state.titan1DeadHandled = true;
            if (!titan2.isDead && titan2.health < titan2.maxHealth * criticalThreshold) {
                titan2.health = Math.min(titan2.maxHealth, titan2.health + (titan2.maxHealth * criticalThreshold));
                // Visual feedback could be added here later
            }
        }
        if (titan2.isDead && !this.state.titan2DeadHandled) {
            this.state.titan2DeadHandled = true;
            if (!titan1.isDead && titan1.health < titan1.maxHealth * criticalThreshold) {
                titan1.health = Math.min(titan1.maxHealth, titan1.health + (titan1.maxHealth * criticalThreshold));
            }
        }

        // Regenerate orb armor (increased rate when titan is dead to make direct attacks harder)
        const armorRegenRate1 = titan1.isDead ? 25 : 5; // 5x faster when defending without titan
        const armorRegenRate2 = titan2.isDead ? 25 : 5;
        orb1.regenerateArmor(dt, armorRegenRate1);
        orb2.regenerateArmor(dt, armorRegenRate2);

        // Titan behavior depends on state
        if (!titan1.isDead && !titan2.isDead) {
            // Both alive: fight each other
            // Class-based speed modifiers for Titans
            // Faster classes = faster titan, slower classes = slower titan
            const getClassSpeedModifier = (classType: string): number => {
                switch (classType) {
                    case 'NINJA': return 1.15;  // Fast class = faster titan
                    case 'SAMURAI': return 1.0; // Balanced
                    case 'MONK': return 0.85;   // Slow/strong class = slower titan
                    default: return 1.0;
                }
            };

            const titan1SpeedMod = getClassSpeedModifier(player1.classType);
            const titan2SpeedMod = getClassSpeedModifier(player2.classType);

            // Base speed is 10, modified by class
            const baseSpeed = 10;

            if (dist > fightRange) {
                titan1.vx = baseSpeed * titan1SpeedMod;
                titan2.vx = -baseSpeed * titan2SpeedMod;
            } else {
                titan1.vx = 0;
                titan2.vx = 0;
                // Titan Clashes - simultaneous attacks with reduced damage
                // Damage increased again (from 12/22 to 16/28) per user request
                const titanDmg = (player1.lane === 'BACKGROUND' && player2.lane === 'BACKGROUND') ? 16 : 28;
                if (Math.random() < 0.008) {
                    // Simultaneous damage to both titans
                    titan1.takeDamage(titanDmg);
                    titan2.takeDamage(titanDmg);
                    this.state.hitStop = 5;
                    this.state.lastAttackerId = 'TITAN'; // Background event
                    // Set a valid pos for titans so we don't crash or guess wrong
                    this.state.lastHitPos = { x: (titan1.x + titan2.x) / 2, y: titan1.y + 40 };
                }
            }
        } else {
            // One Titan is dead - surviving Titan marches to enemy orb
            if (titan1.isDead && !titan2.isDead) {
                // Titan2 marches left toward orb1
                const targetX = orb1.x + orb1.width;
                if (titan2.x > targetX + 30) {
                    titan2.vx = -3; // Slower march
                    this.state.titanCharging = 0;
                    this.state.titanChargeTimer = 0;
                } else {
                    // At orb - deal damage over time
                    titan2.vx = 0;

                    // DOT to orb (25 damage per second)
                    orb1.health = Math.max(0, orb1.health - (25 * dt));
                    orb1.lastHitTime = Date.now();

                    // Start final charge when orb is at 35% or below
                    // Timer starts with initial delay to give defender more time
                    if (orb1.health <= orb1.maxHealth * 0.35) {
                        if (this.state.titanCharging !== 2) {
                            this.state.titanCharging = 2;
                            this.state.titanChargeTimer = 45; // 45 seconds (increased from 30)
                        }
                    }
                }
            } else if (titan2.isDead && !titan1.isDead) {
                // Titan1 marches right toward orb2
                const targetX = orb2.x - titan1.width;
                if (titan1.x < targetX - 30) {
                    titan1.vx = 3; // Slower march
                    this.state.titanCharging = 0;
                    this.state.titanChargeTimer = 0;
                } else {
                    // At orb - deal damage over time
                    titan1.vx = 0;

                    // DOT to orb (25 damage per second)
                    orb2.health = Math.max(0, orb2.health - (25 * dt));
                    orb2.lastHitTime = Date.now();

                    // Start final charge when orb is at 35% or below
                    // Timer starts with initial delay to give defender more time
                    if (orb2.health <= orb2.maxHealth * 0.35) {
                        if (this.state.titanCharging !== 1) {
                            this.state.titanCharging = 1;
                            this.state.titanChargeTimer = 45; // 45 seconds (increased from 30)
                        }
                    }
                }
            } else {
                // Both dead - Cancel any charge
                titan1.vx = 0;
                titan2.vx = 0;
                this.state.titanCharging = 0;
                this.state.titanChargeTimer = 0;
            }
        }

        // Update Titan charge timer
        if (this.state.titanCharging > 0 && this.state.titanChargeTimer > 0) {
            this.state.titanChargeTimer -= dt;
            if (this.state.titanChargeTimer <= 0) {
                // Charge complete - destroy opposing orb
                if (this.state.titanCharging === 1) {
                    orb2.health = 0;
                    orb2.isDead = true;
                } else if (this.state.titanCharging === 2) {
                    orb1.health = 0;
                    orb1.isDead = true;
                }
                this.state.hitStop = 30;
                this.state.lastAttackerId = 'TITAN_BEAM';
            }
        }

        titan1.update(dt);
        titan2.update(dt);

        // Win Logic - based on orb destruction
        if (orb1.isDead) {
            this.state.winner = 2; // P2 destroyed P1's orb
        } else if (orb2.isDead) {
            this.state.winner = 1; // P1 destroyed P2's orb
        }
    }
}
