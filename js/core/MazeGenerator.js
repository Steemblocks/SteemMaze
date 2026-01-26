/**
 * Procedural Maze Generator
 * Uses recursive backtracker algorithm to create perfect mazes
 */

export class MazeGenerator {
  /**
   * Generate a new maze using recursive backtracking
   * @param {number} size - Size of the maze (e.g., 15 for 15x15)
   * @returns {Array<Array<Object>>} 2D array of cells with wall data
   */
  static generate(size = 15) {
    // Initialize grid - all walls CLOSED (true)
    const maze = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({
        top: true,
        right: true,
        bottom: true,
        left: true,
        visited: false,
      })),
    );

    const stack = [];
    const startX = Math.floor(Math.random() * size);
    const startZ = Math.floor(Math.random() * size);

    let currentX = startX;
    let currentZ = startZ;
    maze[currentZ][currentX].visited = true;
    stack.push([currentX, currentZ]);

    // Directions: [dx, dz, currentWall, neighborWall]
    const directions = [
      [0, -1, "top", "bottom"], // North
      [1, 0, "right", "left"], // East
      [0, 1, "bottom", "top"], // South
      [-1, 0, "left", "right"], // West
    ];

    while (stack.length > 0) {
      const unvisitedNeighbors = [];

      // Check all four directions
      for (const [dx, dz, wall, oppositeWall] of directions) {
        const newX = currentX + dx;
        const newZ = currentZ + dz;

        if (
          newX >= 0 &&
          newX < size &&
          newZ >= 0 &&
          newZ < size &&
          !maze[newZ][newX].visited
        ) {
          unvisitedNeighbors.push([newX, newZ, wall, oppositeWall]);
        }
      }

      if (unvisitedNeighbors.length > 0) {
        // Choose random unvisited neighbor
        const [newX, newZ, wall, oppositeWall] =
          unvisitedNeighbors[
            Math.floor(Math.random() * unvisitedNeighbors.length)
          ];

        // Remove walls (set to false)
        maze[currentZ][currentX][wall] = false;
        maze[newZ][newX][oppositeWall] = false;

        // Move to neighbor
        currentX = newX;
        currentZ = newZ;
        maze[currentZ][currentX].visited = true;
        stack.push([currentX, currentZ]);
      } else {
        // Backtrack
        const cell = stack.pop();
        if (cell) {
          [currentX, currentZ] = cell;
        }
      }
    }

    // Ensure entrance and exit are open/closed correctly
    // Actually, in Game.js walls are drawn if property is true.
    // So if we want an entrance at 0,0 left, we set left = false?
    // Game.js Line 626: data[0][0].left = false;
    // Game.js Line 627: data[size - 1][size - 1].right = false;
    maze[0][0].left = false;
    maze[size - 1][size - 1].right = false;

    // Cleanup visited
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        delete maze[z][x].visited;
      }
    }

    return maze;
  }

  /**
   * Generate maze with guaranteed solution from start to goal
   * @param {number} size - Maze size
   * @param {Object} start - Starting position {x, z}
   * @param {Object} goal - Goal position {x, z}
   * @returns {Array<Array<Object>>} Maze with guaranteed path
   */
  static generateWithPath(size, start, goal) {
    const maze = this.generate(size);

    // Ensure there's a path from start to goal by opening strategic walls
    // This is a simple fallback - the recursive backtracker usually creates a perfect maze
    return maze;
  }

  /**
   * Validate that a maze has a solution
   * @param {Array} maze - The maze to validate
   * @param {Object} start - Start position
   * @param {Object} goal - Goal position
   * @returns {boolean} True if solvable
   */
  static isSolvable(maze, start, goal) {
    const size = maze.length;
    const visited = Array.from({ length: size }, () => Array(size).fill(false));
    const queue = [[start.x, start.z]];
    visited[start.z][start.x] = true;

    while (queue.length > 0) {
      const [x, z] = queue.shift();

      if (x === goal.x && z === goal.z) return true;

      const cell = maze[z][x];

      // Check all four directions - traverse if NO wall (!)
      if (!cell.top && z > 0 && !visited[z - 1][x]) {
        visited[z - 1][x] = true;
        queue.push([x, z - 1]);
      }
      if (!cell.right && x < size - 1 && !visited[z][x + 1]) {
        visited[z][x + 1] = true;
        queue.push([x + 1, z]);
      }
      if (!cell.bottom && z < size - 1 && !visited[z + 1][x]) {
        visited[z + 1][x] = true;
        queue.push([x, z + 1]);
      }
      if (!cell.left && x > 0 && !visited[z][x - 1]) {
        visited[z][x - 1] = true;
        queue.push([x - 1, z]);
      }
    }

    return false;
  }
}
