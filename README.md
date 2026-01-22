# SteemMaze

SteemMaze is a web-based 3D maze exploration game integrated with the Steem blockchain. Players navigate through procedurally generated mazes, avoid enemies, collect gems, and can save their progress and achievements directly to the Steem blockchain.

## Features

- **3D Gameplay**: Immersive 3D environment built with Three.js, featuring dynamic lighting, fog, and procedurally generated terrain.
- **Blockchain Integration**:
  - Secure login using Steem Keychain.
  - Sync game progress across devices using blockchain storage.
  - Post game achievements and level completions to your Steem blog.
  - Global leaderboard system based on blockchain data.
- **Dynamic Environment**:
  - Day/Night cycle affecting visibility.
  - Procedural placement of obstacles, enemies (zombies), and collectibles.
  - Varied terrain with mountains and atmospheric effects.
- **Progression System**:
  - Multiple levels with increasing difficulty.
  - Inventory system for collected gems and coins.
  - Player statistics tracking (wins, losses, steps taken).

## Technology Stack

- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **3D Engine**: Three.js
- **Build Tool**: Vite
- **Blockchain**: Steem.js, Steem Keychain Integration

## Prerequisites

- Node.js (v14.0.0 or higher)
- npm (Node Package Manager)
- Steem Keychain browser extension (required for login and blockchain interactions)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/steem-maze.git
   cd steem-maze
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Security is a priority. This project uses environment variables and local configuration files to manage sensitive data.

1. **Environment Setup**:
   Copy the example environment file:

   ```bash
   copy .env.example .env
   ```

2. **Local Config**:
   Copy the local configuration example:

   ```bash
   copy config.local.example.js config.local.js
   ```

3. **Edit Configuration**:
   Open `config.local.js` and update the settings as needed.
   _Note: Never commit your `config.local.js` or `.env` files to version control._

## Running the Application

To start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port shown in your terminal).

## Building for Production

To create a production-ready build:

```bash
npm run build
```

The output files will be generated in the `dist/` directory.

## Project Structure

- `js/`: Core application logic (Game engine, UI, Steem integration).
- `public/`: Static assets (3D models, textures, sounds).
- `dist/`: Compiled production build.
- `steem-integration.js`: Main module handling Steem blockchain interactions.

## License

This project is licensed under the MIT License.
