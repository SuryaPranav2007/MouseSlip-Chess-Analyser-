import os
import asyncio
import logging
import shutil
import time
from typing import Optional
import chess
import chess.engine

logger = logging.getLogger("mouseslip.engine")

class EnginePoolTimeoutError(Exception):
    """Exception raised when engine acquisition from pool times out."""
    pass

# Default paths to check
DEFAULT_STOCKFISH_WINDOWS = r"C:\Users\KIIT\Downloads\STOCKFISH\stockfish\stockfish-windows-x86-64-avx2.exe"
DEFAULT_STOCKFISH_LINUX = "/usr/games/stockfish"

def get_stockfish_path() -> str:
    """Finds the Stockfish binary path from env, local project folder, system PATH, or fallback defaults."""
    env_path = os.getenv("STOCKFISH_PATH")
    if env_path:
        if os.path.exists(env_path):
            return env_path
        logger.warning(f"STOCKFISH_PATH env var specified as '{env_path}' but file was not found.")

    # Check Windows paths
    if os.name == "nt":
        # 1. Check packaged bin directory in project
        local_bin = os.path.join(os.path.dirname(__file__), "bin", "stockfish-windows.exe")
        if os.path.exists(local_bin):
            return local_bin
            
        # 2. Check user fallback default
        if os.path.exists(DEFAULT_STOCKFISH_WINDOWS):
            return DEFAULT_STOCKFISH_WINDOWS
            
        # 3. Check system PATH
        path_sf = shutil.which("stockfish") or shutil.which("stockfish.exe")
        if path_sf:
            return path_sf
    else:
        # Check Linux default paths
        if os.path.exists(DEFAULT_STOCKFISH_LINUX):
            return DEFAULT_STOCKFISH_LINUX
        path_sf = shutil.which("stockfish")
        if path_sf:
            return path_sf

    raise FileNotFoundError(
        "Stockfish binary could not be found. Please install Stockfish and configure STOCKFISH_PATH environment variable."
    )

import sys
import threading

class BackgroundLoop:
    def __init__(self):
        self.loop = asyncio.WindowsProactorEventLoopPolicy().new_event_loop()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run_coro(self, coro):
        return asyncio.run_coroutine_threadsafe(coro, self.loop)

bg_loop = None
if sys.platform == "win32":
    bg_loop = BackgroundLoop()

class LoopSafeTransport:
    def __init__(self, transport, bg_loop):
        self.transport = transport
        self.bg_loop = bg_loop

    def is_closing(self):
        return self.transport.is_closing()

    def close(self):
        self.bg_loop.loop.call_soon_threadsafe(self.transport.close)

    def __getattr__(self, name):
        return getattr(self.transport, name)

class LoopSafeAnalysisResult:
    def __init__(self, bg_analysis, bg_loop):
        self.bg_analysis = bg_analysis
        self.bg_loop = bg_loop

    def stop(self):
        self.bg_loop.loop.call_soon_threadsafe(self.bg_analysis.stop)

    async def __aiter__(self):
        queue = asyncio.Queue()
        main_loop = asyncio.get_running_loop()

        def put_item(item):
            main_loop.call_soon_threadsafe(queue.put_nowait, item)

        async def run_iterator():
            try:
                async for info in self.bg_analysis:
                    put_item(("info", info))
            except Exception as e:
                put_item(("error", e))
            finally:
                put_item(("done", None))

        self.bg_loop.run_coro(run_iterator())

        while True:
            item_type, val = await queue.get()
            if item_type == "info":
                yield val
            elif item_type == "error":
                raise val
            elif item_type == "done":
                break

class LoopSafeEngine:
    def __init__(self, transport, engine, bg_loop):
        self.transport = transport
        self.engine = engine
        self.bg_loop = bg_loop

    async def configure(self, options):
        future = self.bg_loop.run_coro(self.engine.configure(options))
        return await asyncio.wrap_future(future)

    async def analyse(self, board, limit, **kwargs):
        future = self.bg_loop.run_coro(self.engine.analyse(board, limit, **kwargs))
        return await asyncio.wrap_future(future)

    async def analysis(self, board, **kwargs):
        future = self.bg_loop.run_coro(self.engine.analysis(board, **kwargs))
        bg_analysis = await asyncio.wrap_future(future)
        return LoopSafeAnalysisResult(bg_analysis, self.bg_loop)

    async def quit(self):
        future = self.bg_loop.run_coro(self.engine.quit())
        return await asyncio.wrap_future(future)

    def __getattr__(self, name):
        return getattr(self.engine, name)

async def async_popen_uci(path):
    if sys.platform == "win32":
        future = bg_loop.run_coro(chess.engine.popen_uci(path))
        transport, raw_engine = await asyncio.wrap_future(future)
        safe_transport = LoopSafeTransport(transport, bg_loop)
        safe_engine = LoopSafeEngine(safe_transport, raw_engine, bg_loop)
        return safe_transport, safe_engine
    else:
        return await chess.engine.popen_uci(path)

class EnginePool:
    def __init__(self, size: int = 3):
        self.size = size
        self.pool = asyncio.Queue()
        self.engines = []
        self.path = ""
        
        # Telemetry counters
        self.active_searches = 0
        self.cancelled_searches = 0
        self.completed_searches = 0
        self.total_search_duration = 0.0
        self.search_count = 0
        
        self.total_queue_wait_time = 0.0
        self.queue_wait_count = 0
        
        self.cancellation_count = 0
        self.engine_restart_count = 0
        
        # Concurrency/contention tracking
        self.active_live_analysis_requests = 0
        self.active_game_review_requests = 0

    async def initialize(self):
        """Spawns persistent Stockfish processes during backend startup."""
        self.path = get_stockfish_path()
        logger.info(f"Initializing EnginePool of size {self.size} using Stockfish at: {self.path}")
        
        for i in range(self.size):
            try:
                # Spawn engine process
                logger.info(f"Checking Stockfish executable: {self.path}")

                if not os.path.isfile(self.path):
                    raise FileNotFoundError(self.path)

                transport, engine = await async_popen_uci(self.path)
                
                # Set basic engine options (e.g. threads, hash size)
                # Avoid heavy CPU consumption per process; 1 thread is enough for single evaluation tasks
                await engine.configure({"Threads": 1, "Hash": 16})
                
                self.engines.append((transport, engine))
                await self.pool.put(engine)
                logger.info(f"Spawned Stockfish worker {i+1}/{self.size}")
            except Exception as e:
                logger.critical(f"STOCKFISH_HEALTH_CHECK: FAILED - Could not spawn Stockfish at {self.path}. Error: {e}")
                # Clean up previously spawned engines
                await self.shutdown()
                raise e
        
        logger.info(f"STOCKFISH_HEALTH_CHECK: SUCCESS - Stockfish binary verified at {self.path}, engine pool ready.")

    async def acquire(self, gen_id: Optional[int] = None):
        """Acquires a free Stockfish engine from the pool with a timeout."""
        t0 = time.time()
        if self.pool.qsize() == 0:
            logger.warning(
                f"[BACKEND] [POOL_EXHAUSTED] Engine pool is fully exhausted! "
                f"Active searches: {self.active_searches}, Size: {self.size}. "
                f"Task for gen_id: {gen_id} will wait."
            )
            
        if self.active_live_analysis_requests > 0 and self.active_game_review_requests > 0:
            logger.info(
                f"[BACKEND] [POOL_CONTENTION] Contention detected! "
                f"Live analysis tasks: {self.active_live_analysis_requests}, "
                f"Game review tasks: {self.active_game_review_requests} are contending for the pool."
            )

        try:
            # Enforce a 10-second timeout to prevent silent deadlock pileups
            engine = await asyncio.wait_for(self.pool.get(), timeout=10.0)
        except asyncio.TimeoutError:
            logger.error(f"[BACKEND] [POOL_TIMEOUT] Timeout waiting for free engine in pool for gen_id: {gen_id} (waited 10s).")
            raise EnginePoolTimeoutError("Timeout waiting for a free engine in the pool.")

        dt = time.time() - t0
        self.total_queue_wait_time += dt
        self.queue_wait_count += 1
        logger.info(f"[BACKEND] [POOL] acquire() completed for gen_id: {gen_id} in {dt:.3f}s. Remaining: {self.pool.qsize()}")
        return engine

    def release(self, engine, gen_id: Optional[int] = None):
        """Returns a Stockfish engine to the pool."""
        self.pool.put_nowait(engine)
        logger.info(f"[BACKEND] [POOL] release() completed for gen_id: {gen_id}. Size: {self.pool.qsize()}")

    async def replace_dead_engine(self, dead_engine):
        """Terminates a dead engine transport and spawns a new one to replace it in the pool."""
        logger.warning("[BACKEND] Replacing a dead Stockfish engine worker...")
        self.engine_restart_count += 1
        
        # Find the dead engine's transport
        for pair in list(self.engines):
            transport, engine = pair
            if engine == dead_engine:
                try:
                    await engine.quit()
                except Exception:
                    pass
                try:
                    transport.close()
                except Exception:
                    pass
                try:
                    self.engines.remove(pair)
                except ValueError:
                    pass
                break
                
        # Spawn a new replacement worker
        try:
            logger.info(f"Spawning replacement Stockfish worker from path: {self.path}")
            transport, new_engine = await async_popen_uci(self.path)
            await new_engine.configure({"Threads": 1, "Hash": 16})
            self.engines.append((transport, new_engine))
            await self.pool.put(new_engine)
            logger.info("[BACKEND] Successfully spawned replacement Stockfish worker.")
        except Exception as e:
            logger.error(f"[BACKEND] Failed to spawn replacement Stockfish worker: {e}")

    async def check_and_recover_pool(self):
        """Checks if any engine has died or is missing, and recovers the pool automatically."""
        dead_engines = []
        for pair in list(self.engines):
            transport, engine = pair
            # If transport is closed or protocol is in an invalid/terminated state
            if transport.is_closing() or getattr(engine, "_is_dead", False) or (hasattr(transport, "_protocol") and transport._protocol is None):
                logger.warning(f"[BACKEND] [POOL] Detected dead/unresponsive engine: {engine}")
                dead_engines.append(engine)
        
        for dead in dead_engines:
            await self.replace_dead_engine(dead)
            
        current_count = len(self.engines)
        if current_count < self.size:
            logger.warning(f"[BACKEND] [POOL] Expected pool size {self.size} but only have {current_count}. Spawning replacements.")
            for _ in range(self.size - current_count):
                try:
                    transport, new_engine = await async_popen_uci(self.path)
                    await new_engine.configure({"Threads": 1, "Hash": 16})
                    self.engines.append((transport, new_engine))
                    await self.pool.put(new_engine)
                except Exception as e:
                    logger.error(f"[BACKEND] [POOL] Recovery worker spawn failed: {e}")

    async def shutdown(self):
        """Terminates all persistent Stockfish processes."""
        logger.info("Shutting down Stockfish EnginePool...")
        for transport, engine in self.engines:
            try:
                await engine.quit()
            except Exception as e:
                logger.debug(f"Error quitting engine: {e}")
            try:
                transport.close()
            except Exception as e:
                logger.debug(f"Error closing transport: {e}")
        self.engines = []
        self.pool = asyncio.Queue()
        logger.info("EnginePool shut down completed.")

# Single global instance of the engine pool
engine_pool_size_env = os.getenv("ENGINE_POOL_SIZE")
try:
    engine_pool_size = int(engine_pool_size_env) if engine_pool_size_env else 4
except ValueError:
    engine_pool_size = 4

engine_pool = EnginePool(size=engine_pool_size)
