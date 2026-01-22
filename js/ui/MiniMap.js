/**
 * MiniMap - Top-down orthographic view of the maze
 * Shows walls, player position, zombies, and goal
 */

import * as THREE from "three";

export class MiniMap {
  constructor(maze, mazeSize, cellSize) {
    this.maze = maze;
    this.mazeSize = mazeSize;
    this.cellSize = cellSize;
    this.player = null;
    this.zombies = [];
    this.goal = null;

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1a);

    const d = mazeSize / 2;
    this.camera = new THREE.OrthographicCamera(-d, d, d, -d, 0.1, 100);
    this.camera.position.set(0, 20, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.up.set(0, 0, -1); // North is up

    // Renderer
    const canvas = document.getElementById("miniMap");
    if (!canvas) {
      console.warn("MiniMap canvas not found");
      return;
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(150, 150);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Build static maze walls
    this.buildMazeWalls();

    // Create dynamic markers
    this.createMarkers();
  }

  buildMazeWalls() {
    const wallMat = new THREE.MeshBasicMaterial({ color: 0x2d3748 });
    const thickness = 0.15;

    for (let z = 0; z < this.mazeSize; z++) {
      for (let x = 0; x < this.mazeSize; x++) {
        const cell = this.maze[z]?.[x];
        if (!cell) continue;

        const ox = x - this.mazeSize / 2 + 0.5;
        const oz = z - this.mazeSize / 2 + 0.5;

        // Right wall
        if (cell.right) {
          const wallGeo = new THREE.BoxGeometry(thickness, 0.1, 1);
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(ox + 0.5, 0, oz);
          this.scene.add(wall);
        }

        // Bottom wall
        if (cell.bottom) {
          const wallGeo = new THREE.BoxGeometry(1, 0.1, thickness);
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(ox, 0, oz + 0.5);
          this.scene.add(wall);
        }

        // Left wall (for left edge)
        if (x === 0) {
          const wallGeo = new THREE.BoxGeometry(thickness, 0.1, 1);
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(ox - 0.5, 0, oz);
          this.scene.add(wall);
        }

        // Top wall (for top edge)
        if (z === 0) {
          const wallGeo = new THREE.BoxGeometry(1, 0.1, thickness);
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(ox, 0, oz - 0.5);
          this.scene.add(wall);
        }
      }
    }
  }

  createMarkers() {
    // Player marker (green circle)
    const playerGeo = new THREE.CircleGeometry(0.3, 16);
    const playerMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    this.playerMarker = new THREE.Mesh(playerGeo, playerMat);
    this.playerMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.playerMarker);

    // Goal marker (gold star)
    const goalGeo = new THREE.CircleGeometry(0.25, 5);
    const goalMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.goalMarker = new THREE.Mesh(goalGeo, goalMat);
    this.goalMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.goalMarker);

    // Zombie markers pool
    this.zombieMarkers = [];
  }

  setPlayer(playerPos) {
    this.player = playerPos;
  }

  setGoal(goalPos) {
    this.goal = goalPos;
  }

  setZombies(zombies) {
    this.zombies = zombies;

    // Create or remove zombie markers as needed
    while (this.zombieMarkers.length < zombies.length) {
      const zombieGeo = new THREE.CircleGeometry(0.2, 8);
      const zombieMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const marker = new THREE.Mesh(zombieGeo, zombieMat);
      marker.rotation.x = -Math.PI / 2;
      this.scene.add(marker);
      this.zombieMarkers.push(marker);
    }

    while (this.zombieMarkers.length > zombies.length) {
      const marker = this.zombieMarkers.pop();
      this.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
  }

  update() {
    if (!this.renderer) return;

    // Update player position
    if (this.player) {
      this.playerMarker.position.set(
        this.player.x - this.mazeSize / 2 + 0.5,
        0.05,
        this.player.z - this.mazeSize / 2 + 0.5
      );
    }

    // Update goal position
    if (this.goal) {
      this.goalMarker.position.set(
        this.goal.x - this.mazeSize / 2 + 0.5,
        0.05,
        this.goal.z - this.mazeSize / 2 + 0.5
      );
    }

    // Update zombie positions
    this.zombies.forEach((zombie, i) => {
      if (this.zombieMarkers[i]) {
        this.zombieMarkers[i].position.set(
          zombie.gridX - this.mazeSize / 2 + 0.5,
          0.05,
          zombie.gridZ - this.mazeSize / 2 + 0.5
        );
      }
    });

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    if (!this.renderer) return;
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.15;
    this.renderer.setSize(size, size);
  }

  show() {
    const canvas = document.getElementById("miniMap");
    if (canvas) canvas.style.display = "block";
  }

  hide() {
    const canvas = document.getElementById("miniMap");
    if (canvas) canvas.style.display = "none";
  }

  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
