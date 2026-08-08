# MouseSlip
### Chess Analysis
[![Built with React](https://img.shields.io/badge/Built%20with-React-61dafb?style=flat&logo=react)](https://react.dev)
[![Built with FastAPI](https://img.shields.io/badge/Built%20with-FastAPI-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![Engine Stockfish](https://img.shields.io/badge/Engine-Stockfish%2016-orange?style=flat)](https://stockfishchess.org)

<p align="center">
  <img src="frontend/public/logo.png" alt="MouseSlip Logo" width="120" height="120" />
</p>

MouseSlip is a premium, real-time chess position analysis and game review platform. It combines a sophisticated local engine worker pool running Stockfish 16 with a modern, reactive React/Vite user interface. The application offers live evaluation tracking, automated move classifications, evaluation swing graphs, multi-PV arrow indicators with collision offsets, and interactive opening detection. Users can import positions using FEN, load games using PGN format, or directly search and fetch recent games from Chess.com.

---

## Features

- **Real-Time Stockfish 16 Analysis**: Persistent multi-threaded Stockfish subprocesses are coordinated using an async engine pool, streaming search results at deep ply depths over high-performance WebSockets.
- **Advanced Move Classification**: Moves are automatically classified using win-probability loss differentials, tactical sacrifice checks, and escape parameters. The system assigns one of ten exact classifications:
  - **Brilliant Move (`!!`)**: Spectacular sacrifice that preserves the winning advantage.
  - **Great Move (`!`)**: High-impact only-move or comeback that is difficult to find.
  - **Best Move (`★`)**: The engine's preferred top candidate.
  - **Excellent Move (`★`)**: Equally strong alternative maintaining the position's evaluation.
  - **Good Move (`✓`)**: Solid move, though stronger alternatives were available.
  - **Book Move (`📖`)**: Standard established chess opening theory.
  - **Inaccuracy (`?!`)**: Minor mistake slightly compromising winning chances.
  - **Mistake (`?`)**: Bad move that visibly compromises the position.
  - **Missed Win (`×`)**: Overlooked tactical win, checkmate threat, or material gain.
  - **Blunder (`??`)**: Critical error altering the game's outcome.
- **Intelligent Arrow Overlays**: Renders target candidate lines directly on the chessboard (green for best, yellow for 2nd-best) with collision offsetting. Moves starting from the same square are automatically rendered parallel to prevent overlapping.
- **Dynamic Live Evaluation Bar**: Displays win-percentage distributions and mate indicators. The label anchors cleanly to prevent vertical jitter during engine updates, with automatic font scaling for lopsided evaluations.
- **Spacious Advantage Graph**: Interactive, scrollable line graph showing evaluation swings. Plots moves incrementally during active play using neutral markers, updating to classification colors post-review.
- **Flexible Imports**: Import game states by pasting a single FEN string, inputting standard PGN lists, or searching any username to load recent Chess.com games.
- **Responsive Aesthetics**: High-end antique instrument dark theme tailored with micro-animations, custom sound effects, and fully responsive layouts.
- **Configurable Settings**: Toggle targeted analysis depth, adjust audio volume, and toggle second-best arrow overlays.

---

## Tech Stack

### Frontend

| Dependency | Target Version / Package | Purpose |
| :--- | :--- | :--- |
| **React** | `^19.2.7` | UI rendering library |
| **React DOM** | `^19.2.7` | DOM rendering bindings |
| **Vite** | `^8.1.1` | Build tool and dev server |
| **TypeScript** | `~6.0.2` | Strong type checking |
| **chess.js** | `^1.4.0` | Move validation and chess state logic |
| **chessground** | `^9.2.1` | Chessboard UI component |
| **framer-motion** | `^12.42.2` | Smooth micro-animations and panel transitions |
| **lucide-react** | `^1.23.0` | UI icon pack |
| **tailwindcss** | `^3.4.19` | Utility-first CSS styling framework |
| **oxlint** | `^1.71.0` | High-performance linter |

### Backend

| Dependency | Target Version | Purpose |
| :--- | :--- | :--- |
| **Python** | `>=3.10` | Running environment |
| **FastAPI** | `>=0.110.0` | API routing and server framework |
| **Uvicorn** | `>=0.29.0` | ASGI server implementation |
| **python-chess** | `>=1.10.0` | Chess state validation, FEN parsing, and UCI bindings |
| **websockets** | `>=12.0` | Live analysis streaming coordinator |
| **aiohttp** | `>=3.9.0` | Asynchronous external REST HTTP client |
| **pydantic** | `>=2.7.0` | Request verification schemas |
| **Stockfish** | `16` | Asynchronous chess analysis engine process |

---

## Project Structure

```
mouseslip/
├── backend/
│   ├── bin/                      # Stockfish Windows binary cache folder
│   ├── config.py                 # Move classification threshold configuration
│   ├── Dockerfile                # Backend container config installing Stockfish via apt
│   ├── engine.py                 # Subprocess Stockfish engine pool manager
│   ├── main.py                   # FastAPI application, WS handlers & REST endpoints
│   ├── openings.py               # Chess opening name classifier logic
│   ├── openings_cache.json       # Opening definition data
│   ├── requirements.txt          # Python requirements (FastAPI, uvicorn, chess, etc.)
│   ├── utils.py                  # Win probability formulas & classification logic
│   └── test_*.py / verify_*.py   # Logic and arrow regression test suite files
├── frontend/
│   ├── public/                   # Static public assets (logo.png)
│   ├── src/
│   │   ├── components/           # UI elements (Chessboard, ControlPanel, EvaluationBar, etc.)
│   │   ├── constants/            # Move classification UI constants/styles
│   │   ├── hooks/                # useWebSocket communication hook
│   │   ├── utils/                # Audio synthesizers
│   │   ├── App.tsx               # Main layout, game review coordinator
│   │   └── config.ts             # Split-hosting URL resolver helper
│   ├── package.json              # Client scripts, dependencies, build targets
│   ├── tailwind.config.js        # Styling theme and custom animation definitions
│   └── vite.config.ts            # Vite compile environment setup
├── docker-compose.yml            # Multi-container orchestration (local/prod setup)
└── nginx.conf                    # Reverse proxy server configuration
```

---

## Architecture Overview

```
                      +-------------------+
                      |   React Client    |
                      +---------+---------+
                                |
                    HTTP REST   |   WebSockets
                  (Game Review) |  (Live Stats)
                                v
                      +---------+---------+
                      |  FastAPI Backend  |
                      +---------+---------+
                                |
                                | Async UCI Streams
                                v
                      +---------+---------+
                      | Stockfish Pool    |
                      | (Engine Subprocs) |
                      +-------------------+
```

1. **Board Exploration**: When a move is played, the frontend sends the active position to the WebSocket pipeline.
2. **Engine Pool Allocation**: The backend acquires an idle Stockfish instance from its concurrency pool, terminates any active search for that connection, and starts a fresh search command stream.
3. **Buffered Parsing**: Multi-PV search data streams back to the client at escalating depth intervals. Evaluated scores, best moves, and PV lines are packaged and sent.
4. **Game Review**: Triggering "Review Game" dispatches the full history to a backend thread. The backend calculates move accuracies, detects tactics, and generates structured analysis payload results.

---

## Getting Started / Local Development

Follow these steps to configure and run the MouseSlip application on your local development machine.

### Prerequisites
- **Node.js**: `v18.x` or later (verify with `node -v`)
- **Python**: `3.10.x` or later (verify with `python --version` or `python3 --version`)
- **Stockfish Binary**: Ensure you have a Stockfish executable matching your OS.

---

### Step 1: Clone the Repository
Clone the codebase to your development directory:
```bash
git clone <repository-url>
cd mouseslip
```

---

### Step 2: Backend Setup

1. **Navigate to the backend folder**:
   ```bash
   cd backend
   ```
2. **Create a virtual environment**:
   * Windows:
     ```bash
     python -m venv .venv
     .venv\Scripts\activate
     ```
   * macOS/Linux:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```
3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
4. **Create a Local Environment File**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Modify `.env` to point to the local Stockfish path on your machine if it differs from the default paths:
   ```ini
   # Example local path on Windows:
   STOCKFISH_PATH=bin/stockfish-windows.exe
   
   # Server settings:
   ENGINE_POOL_SIZE=4
   LOG_LEVEL=INFO
   ALLOWED_ORIGINS=http://localhost:5173
   ```
5. **Run tests**:
   Verify everything is correct:
   ```bash
   python test_backend.py
   python test_regression_arrows.py
   python test_leak_regression.py
   ```
6. **Launch local backend development server**:
   ```bash
   python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

---

### Step 3: Frontend Setup

1. **Open a new terminal and navigate to the frontend folder**:
   ```bash
   cd frontend
   ```
2. **Install Node modules**:
   ```bash
   npm install
   ```
3. **Create a Local Environment File**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Ensure the variables point to your local FastAPI instances:
   ```ini
   VITE_API_URL=http://localhost:8000
   VITE_WS_URL=ws://localhost:8000
   ```
4. **Build Check**:
   Confirm compile targets and TS definitions pass check:
   ```bash
   npm run build
   ```
5. **Run client development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deployment

The app is fully configured for split-hosting deployment:

- **Frontend (Vercel / Netlify)**:
  - Deploys static client files.
  - Required Environment Variables:
    - `VITE_API_URL`: The production HTTP URL of your deployed backend.
    - `VITE_WS_URL`: The production WebSocket URL of your deployed backend (e.g. `wss://your-backend.railway.app`).
- **Backend (Railway)**:
  - Deploys containerized code using the provided `Dockerfile`.
  - The `Dockerfile` handles automated `apt-get` system installation of the native Linux `stockfish` engine binary.
  - Required Environment Variables:
    - `STOCKFISH_PATH`: `/usr/games/stockfish`
    - `ALLOWED_ORIGINS`: Comma-separated list containing your frontend production domains.
    - `ENGINE_POOL_SIZE`: Dynamic number of concurrent Stockfish instances to allocate (e.g. `4` to `6`).
    - `LOG_LEVEL`: `INFO` or `WARNING` for production logging.

---

## Configuration & Settings

- **Target Analysis Depth**: Adjustable slider (10 to 22) in the Settings panel controls Stockfish's analysis limit.
- **2nd-Best Arrow Overlay**: Toggle second-best candidate arrow overlays (yellow) inside Settings.
- **Audio Control**: Audio feedback can be toggled and volumes scaled directly.

---

## Roadmap & Known Limitations

- **Lichess Game Import**: Search and load Lichess games directly by username (UI placeholder established, API wiring in roadmap).
- **Custom Opening Library**: Ability to upload custom openings files and override Book state matching.

### DEPLOYED LINK = https://mouse-slip-chess-analyser.vercel.app/
---

**Author**

Built by **[Surya Pranav Pratapam](https://www.linkedin.com/in/surya-pranav-pratapam-7502b133b/)**
