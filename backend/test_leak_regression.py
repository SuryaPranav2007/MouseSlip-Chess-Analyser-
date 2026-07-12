import sys
import os
import asyncio
import chess
import chess.pgn
import io
import time

# Ensure backend directory is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import engine_pool, EnginePoolTimeoutError

# A valid 51-move legal game PGN
PGN_51_MOVES = (
    "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 "
    "8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 "
    "14. Ng3 g6 15. a4 c5 16. d5 c4 17. Bg5 h6 18. Be3 Nc5 19. Qd2 h5 20. Bg5 Be7 "
    "21. Rad1 Nfd7 22. Bxe7 Qxe7 23. Qh6 Qf6 24. Ng5 Qg7 25. Qxg7+ Kxg7 26. h4 Nb6 "
    "27. axb5 axb5 28. Ra1 Nba4 29. Ra2 Ra6 30. Rea1 Rea8 31. Nf1 Bc8 32. Ne3 Bd7 "
    "33. Nf3 f6 34. Nd2 Kf7 35. f3 Ke7 36. Kf2 Be8 37. Ke2 Bd7 38. Kf2 Be8 "
    "39. Ke2 Bd7 40. Kf2 Be8 41. Ke2 Bd7 42. Kf2 Be8 43. Ke2 Bd7 44. Kf2 Be8 "
    "45. Ke2 Bd7 46. Kf2 Be8 47. Ke2 Bd7 48. Kf2 Be8 49. Ke2 Bd7 50. Kf2 Be8 "
    "51. Ke2 Bd7"
)

async def run_leak_test():
    print("Initializing Engine Pool...")
    await engine_pool.initialize()
    
    game = chess.pgn.read_game(io.StringIO(PGN_51_MOVES))
    board = game.board()
    
    positions = [board.copy()]
    for move in game.mainline_moves():
        board.push(move)
        positions.append(board.copy())
        
    print(f"Generated {len(positions)} sequential positions to test (102 plies).")
    
    # Track acquires and releases
    initial_available = engine_pool.pool.qsize()
    print(f"Initial available engines in pool: {initial_available}/{engine_pool.size}")
    assert initial_available == engine_pool.size, f"Pool must start fully loaded. Expected {engine_pool.size}, got {initial_available}"
    
    try:
        for idx, pos in enumerate(positions):
            t_start = time.time()
            gen_id = idx + 1
            
            # Acquire
            engine = await engine_pool.acquire(gen_id=gen_id)
            elapsed_acquire = time.time() - t_start
            
            # Verify time budget to acquire is extremely low (since we are sequential and no other tasks run, it should be instant)
            assert elapsed_acquire < 0.5, f"Position {gen_id} took too long to acquire: {elapsed_acquire:.3f}s"
            
            # Simulate a quick search limit (depth 6)
            try:
                result_info = await engine.analyse(
                    pos,
                    chess.engine.Limit(depth=6, time=0.15)
                )
            finally:
                # Release
                engine_pool.release(engine, gen_id=gen_id)
                
            elapsed_total = time.time() - t_start
            # Verify total time budget for each position is reasonable
            assert elapsed_total < 1.5, f"Position {gen_id} total time exceeded budget: {elapsed_total:.3f}s"
            
            # Assert acquired/released counts stay perfectly balanced (qsize returns to initial)
            current_available = engine_pool.pool.qsize()
            assert current_available == initial_available, (
                f"Engine leak detected at ply {gen_id}! "
                f"Available: {current_available}, Expected: {initial_available}"
            )
            
        print("\nAll 102 positions processed. Verifying final pool health...")
        final_available = engine_pool.pool.qsize()
        print(f"Final available engines in pool: {final_available}/{engine_pool.size}")
        assert final_available == initial_available, "Engines leaked at the end of run!"
        print("SUCCESS: Engine acquired/released counts stayed perfectly balanced throughout the full game review.")
        
    finally:
        await engine_pool.shutdown()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(run_leak_test())
