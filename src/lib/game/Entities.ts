export type Lane = 'FOREGROUND' | 'BACKGROUND';
export type EntityType = 'SAMURAI' | 'NINJA' | 'MONK' | 'TITAN';

export class Entity {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    vx: number = 0;
    vy: number = 0;
    isDead: boolean = false;
    facingRight: boolean = true;

    constructor(x: number, y: number, width: number, height: number, color: string) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
    }

    update(dt: number) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    getBounds() {
        return { x: this.x, y: this.y, w: this.width, h: this.height };
    }

    collidesWith(other: Entity): boolean {
        const a = this.getBounds();
        const b = other.getBounds();
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }
}

export class Fighter extends Entity {
    health: number;
    maxHealth: number;
    attackCooldown: number = 0;
    lastFrameAtkPressed: boolean = false;
    isAttacking: boolean = false;
    hitTargets: Set<Entity> = new Set(); // Track unique hits per swing
    isBlocking: boolean = false;
    isCrouching: boolean = false; // New State
    lane: Lane = 'FOREGROUND';
    hitStun: number = 0; // Frames to freeze
    classType: EntityType = 'SAMURAI';
    specialMeter: number = 0; // 0 to 100
    isUsingSpecial: boolean = false;
    specialFrame: number = 0;

    constructor(x: number, y: number, color: string, health: number) {
        super(x, y, 30, 60, color); // Smaller pixel size
        this.health = health;
        this.maxHealth = health;
    }

    takeDamage(amount: number) {
        if (this.isBlocking) {
            this.health = Math.max(0, this.health - amount * 0.1); // 90% reduction
        } else {
            this.health = Math.max(0, this.health - amount);
        }
        if (this.health <= 0) this.isDead = true;
    }
}

export class Titan extends Fighter {
    proximityCharge: number = 0; // 0 to 1, tracks time player is nearby for defense bonus
    lastDamageTime: number = 0;

    constructor(x: number, y: number, color: string) {
        super(x, y, color, 2500); // Increased HP slightly (2250 -> 2500) per user request
        this.width = 100;
        this.height = 150;
        this.lane = 'BACKGROUND';
        this.classType = 'TITAN';
    }

    takeDamage(amount: number) {
        this.lastDamageTime = Date.now();
        super.takeDamage(amount);
    }
}

export class Player extends Fighter {
    id: number;
    // Respawn System
    respawnTimer: number = 0; // Countdown in seconds
    isRespawning: boolean = false;
    deathAnimFrame: number = 0; // Frame counter for death animation
    resurrectionAnimFrame: number = 0; // Frame counter for resurrection animation
    isResurrecting: boolean = false; // Currently in resurrection animation

    constructor(id: number, x: number, y: number, color: string, type: EntityType = 'SAMURAI') {
        super(x, y, color, 100);
        this.id = id;
        this.width = 20; // Pixel art logic: smaller logical size
        this.height = 40;
        this.classType = type;

        // Class Stats - High HP for durability
        if (type === 'SAMURAI') {
            this.maxHealth = 800;
            this.health = 800;
        } else if (type === 'NINJA') {
            this.maxHealth = 700;
            this.health = 700;
        } else if (type === 'MONK') {
            this.maxHealth = 1000;
            this.health = 1000;
        }
    }

    // Override takeDamage to handle respawn instead of permanent death
    takeDamage(amount: number) {
        if (this.isBlocking) {
            this.health = Math.max(0, this.health - amount * 0.1); // 90% reduction
        } else {
            this.health = Math.max(0, this.health - amount);
        }
        if (this.health <= 0 && !this.isRespawning && !this.isDead) {
            this.startRespawn();
        }
    }

    startRespawn() {
        this.isDead = true;
        this.isRespawning = true;
        this.respawnTimer = 10; // 10 seconds
        this.deathAnimFrame = 0;
    }

    respawn(orbX: number, orbY: number, groundY: number) {
        this.health = Math.floor(this.maxHealth * 0.75); // 75% health
        this.isDead = false;
        this.isRespawning = false;
        this.isResurrecting = true;
        this.resurrectionAnimFrame = 0;
        // Position next to orb
        this.x = this.id === 1 ? orbX + 25 : orbX - 25;
        this.y = groundY;
        this.vx = 0;
        this.vy = 0;
    }
}

export class Orb extends Entity {
    health: number = 7500;
    maxHealth: number = 7500;
    armor: number = 1875; // Quarter of HP
    maxArmor: number = 1875;
    isShielded: boolean = true; // Protected while Titan alive
    owner: number; // 1 or 2
    lastHitTime: number = 0; // Timestamp of last hit (for temporary HP display)
    // Defense bonus when player dies (not cumulative)
    hasDefenseBonus: boolean = false;
    defenseBonus: number = 0.75; // 25% damage reduction when active

    constructor(x: number, y: number, owner: number) {
        super(x, y, 15, 15, owner === 1 ? '#00ffff' : '#ff00ff');
        this.owner = owner;
    }

    activateDefenseBonus() {
        // Non-cumulative - only activates if not already active
        if (!this.hasDefenseBonus) {
            this.hasDefenseBonus = true;
        }
    }

    takeDamage(amount: number, isSpecialAttack: boolean = false, canPierce: boolean = false) {
        // Apply defense bonus if active (25% damage reduction)
        if (this.hasDefenseBonus) {
            amount = amount * this.defenseBonus;
        }

        let directDamage = 0;

        // LATE GAME MECHANIC: Piercing
        // If condition meets (Titan active + Player Bonus active), 20% damage ignores armor
        if (canPierce && this.hasDefenseBonus) {
            directDamage = amount * 0.20;
            amount -= directDamage; // Remaining damage hits armor
        }

        // Damage hits armor first, then health
        if (this.armor > 0) {
            const armorDmg = Math.min(this.armor, amount);
            this.armor -= armorDmg;
            amount -= armorDmg;
        }

        // Apply remaining damage + direct piercing damage
        const totalHealthDamage = amount + directDamage;
        if (totalHealthDamage > 0) {
            this.health = Math.max(0, this.health - totalHealthDamage);
        }

        this.lastHitTime = Date.now(); // Record hit time
        if (this.health <= 0) this.isDead = true;
    }

    // Regenerate armor (call in game loop)
    // rate: armor per second (default 5, increased to 25 when titan is dead)
    regenerateArmor(dt: number, rate: number = 5) {
        if (this.armor < this.maxArmor) {
            this.armor = Math.min(this.maxArmor, this.armor + (rate * dt));
        }
    }
}
