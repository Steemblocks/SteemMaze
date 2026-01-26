/**
 * EntityRegistry.js
 * Manages positions of all active entities to prevent collisions (overlapping).
 */

export class EntityRegistry {
  static entities = new Map(); // Key: ID, Value: { x, z, type }

  static register(id, x, z, type) {
    this.entities.set(id, { x, z, type });
  }

  static update(id, x, z) {
    const entity = this.entities.get(id);
    if (entity) {
      entity.x = x;
      entity.z = z;
    }
  }

  static unregister(id) {
    this.entities.delete(id);
  }

  static isOccupied(x, z, ignoreId = null) {
    for (const [id, pos] of this.entities) {
      if (id !== ignoreId && pos.x === x && pos.z === z) {
        return true;
      }
    }
    return false;
  }

  static clear() {
    this.entities.clear();
  }
}
