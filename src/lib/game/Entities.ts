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
    isAttacking: boolean = false;
    isBlocking: boolean = false;
    lane: Lane = 'FOREGROUND';
    hitStun: number = 0; // Frames to freeze
    classType: EntityType = 'SAMURAI';

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
    constructor(x: number, y: number, color: string) {
        super(x, y, color, 2000);
        this.width = 100;
        this.height = 150;
        this.lane = 'BACKGROUND';
        this.classType = 'TITAN';
    }
}

export class Player extends Fighter {
    id: number;

    constructor(id: number, x: number, y: number, color: string, type: EntityType = 'SAMURAI') {
        super(x, y, color, 100);
        this.id = id;
        this.width = 20; // Pixel art logic: smaller logical size
        this.height = 40;
        this.classType = type;

        // Class Stats
        if (type === 'SAMURAI') {
            this.maxHealth = 120;
            this.health = 120;
        } else if (type === 'NINJA') {
            this.maxHealth = 80;
            this.health = 80;
        } else if (type === 'MONK') {
            this.maxHealth = 150;
            this.health = 150;
        }
    }
}
