# SteemMaze

SteemMaze is a high-performance, web-based 3D maze exploration game deeply integrated with the Steem blockchain. Players navigate through procedurally generated, aesthetically rich 3D garden environments, overcoming various entities, collecting rewards, and securing their achievements on the blockchain.

<img width="1365" height="632" alt="SteemMaze Gameplay" src="https://github.com/user-attachments/assets/42ce5c11-6929-4c84-92cd-9ac60d715b2a" />

## Key Features

-   **Immersive 3D Engine**: Built with **Three.js**, featuring dynamic lighting, volumetric fog, and procedurally generated terrain and maze structures.
-   **Blockchain Ecosystem**:
    -   **Secure Authentication**: One-click login via **Steem Keychain**.
    -   **Persistent Progress**: Sync your level progress, inventory, and stats directly to the Steem blockchain.
    -   **Global Leaderboards**: Competitive rankings driven by immutable blockchain records.
    -   **Social Integration**: Share your level completions and high scores directly to your Steem blog.
-   **Advanced Gameplay Mechanics**:
    -   **10 Challenging Levels**: Each level increases in complexity and introduces new hazards.
    -   **Dynamic Shop System**: Collect coins to purchase essential items like Light Bursts, Potions, and Fog Removers.
    -   **Combo Multiplier**: Reward for continuous movement, boosting scores up to 2.0x.
    -   **Day/Night Cycle**: Real-time atmospheric shifts that impact visibility and entity behavior.

## Entities and Hazards

| Entity | Description | Behavior | Reward |
| :--- | :--- | :--- | :--- |
| **Zombie** | Basic undead | Slow moving, predictable | 100+ Pts |
| **Hell Hound** | Fast stalker | High speed chaser, requires agile movement | 200+ Pts |
| **Monster** | Common threat | Standard patrolling enemy | 50 Pts |
| **Fallen Angel** | Mini-Boss | Surrounded by a Crimson Aura, strikes from range | 150 Pts |
| **Bigfoot Boss**| The Ultimate Apex | Massive, relentless, and deadly. Found in later levels | 500 Pts |

## Scoring and Progression

The game rewards skill, speed, and thorough exploration.

-   **Gems**: 75 Pts per collection.
-   **Zombies Eliminated**: 100+ Pts (requires Potion).
-   **Level Completion**: 100+ Pts (scales with level).
-   **Combo System**:
    -   8 Steps: 1.05x Multiplier
    -   25 Steps: 1.30x Multiplier
    -   60 Steps: 2.00x Multiplier
-   **Penalties**: Hitting walls reduces score by 75 Pts.

## Technology Stack

-   **Engine**: Three.js (v0.160.0)
-   **Development**: Vite (v7.3.1)
-   **Blockchain**: Steem.js (@steemit/steem-js)
-   **Styling**: Vanilla CSS (Post-modern/Glassmorphism aesthetic)
-   **Fonts**: Outfit (Google Fonts), Material Icons Round

## Getting Started

### Prerequisites

-   Node.js (v18.0.0 or higher recommended)
-   npm or yarn
-   [Steem Keychain](https://chrome.google.com/webstore/detail/steem-keychain/lkocmhepmocadocglhkbgphlmelocpjo) browser extension

### Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/steem-maze.git
    cd steem-maze
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

### Configuration

The simplest way to configure the Steem storage account is by editing the `js/steem/steem.js` file directly.

1.  Open `js/steem/steem.js`.
2.  Locate the `STEEM_SYSTEM_ACCOUNT` object at the top of the file:
    ```javascript
    const STEEM_SYSTEM_ACCOUNT = {
      username: "yoursteemid",        // Enter your Steem ID here
      postingKey: "yourprivatekey",     // Enter your Private Posting Key here
    };
    ```
3.  Enter your **Steem ID** and **Private Posting Key**.

This account handles automatic game record storage and global player lists. Note that regular players do not need keys here; they simply log in with the **Steem Keychain** browser extension.

---

### Development

Run the local development server:
```bash
npm run dev
```
The application will be served at `http://localhost:5173`.

## Deployment

### Production Build
```bash
npm run build
```
This generates a highly optimized `dist/` directory ready for any static hosting or Docker deployment.

### Docker Deployment
The project includes a `Dockerfile` optimized for reverse proxy setups.

1.  **Build**: `docker build -t steem-maze .`
2.  **Run**: `docker run -d -p 8081:80 --name steem-maze --restart always steem-maze`

## Project Structure

-   `js/`: Core application modules (Game engine, UI, Steem integration).
-   `styles/`: CSS modules for UI and layout.
-   `public/`: Static assets, textures, and 3D models.
-   `steem-integration.js`: High-level wrapper for blockchain operations.
-   `animation-cache.js`: Optimized caching for 3D model animations.

## License

Distributed under the MIT License. See `LICENSE` for more information.
