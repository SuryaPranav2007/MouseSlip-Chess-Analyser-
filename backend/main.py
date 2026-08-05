import os
import asyncio
import logging
import time
from contextlib import asynccontextmanager
import sys
import asyncio
import asyncio
import sys

if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(
        asyncio.WindowsProactorEventLoopPolicy()
    )

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

import chess
import chess.pgn

from openings import OpeningDetector
from engine import engine_pool, EnginePoolTimeoutError
from utils import (
    fetch_chess_com_games,
    score_to_cp,
    classify_move,
    calculate_move_accuracy,
    parse_pgn_game,
    score_to_win_percent,
    win_percent_loss,
    get_game_phase,
    format_cp_to_score_str,
    to_canonical_evaluation,
    board_to_canonical_evaluation
)

# Configure logging
log_level_env = os.getenv("LOG_LEVEL", "INFO").upper()
log_level = getattr(logging, log_level_env, logging.INFO)

logging.basicConfig(
    level=log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("mouseslip.main")

# Global instances
opening_detector = OpeningDetector()
# Global in-memory cache for chess analysis
# Key: FEN (first 4 fields), Value: {depth, score, best_move, pv}
analysis_cache: Dict[str, Dict[str, Any]] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting MouseSlip backend...")
    # Initialize openings
    await opening_detector.initialize()
    # Initialize Stockfish engine pool
    await engine_pool.initialize()
    logger.info("SERVER_STARTED")
    logger.info("PORT=8000")
    logger.info("ROUTE_REGISTERED=/api/review")
    yield
    # Shutdown
    logger.info("Stopping MouseSlip backend...")
    await engine_pool.shutdown()

app = FastAPI(
    title="MouseSlip API",
    description="Premium Chess Analysis Backend using FastAPI and Stockfish",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    allow_origins = [orig.strip() for orig in allowed_origins_env.split(",") if orig.strip()]
else:
    allow_origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "*"
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PGNRequest(BaseModel):
    pgn: str

class FENRequest(BaseModel):
    fen: str

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "engines_available": engine_pool.pool.qsize()}

@app.get("/api/chess-com/games")
async def get_chess_com_games(username: str = Query(..., description="Chess.com username")):
    try:
        games = await fetch_chess_com_games(username)
        return {"success": True, "games": games}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"Failed to fetch games for {username}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error fetching Chess.com games.")

class ReviewRequest(BaseModel):
    pgn: Optional[str] = None
    fen: Optional[str] = None
    # We can also receive a list of FENs directly
    fens: Optional[List[str]] = None

def format_cp_to_score_str(cp: Optional[int]) -> str:
    if cp is None:
        return "N/A"
    if abs(cp) >= 9000:
        return f"M{1 if cp > 0 else -1}"
    return f"{cp/100:+.2f}"

async def analyze_position(fen: str, depth_limit: int = 12) -> Dict[str, Any]:
    """Analyzes a single FEN using a temporary engine lease. Caches result."""
    # Check cache first (using first 4 fields of FEN)
    fen_key = " ".join(fen.split(" ")[:4])
    if fen_key in analysis_cache:
        return analysis_cache[fen_key]

    board = chess.Board(fen)
    if board.is_game_over():
        # Use canonical evaluation to correctly reflect which side won.
        # Previously hardcoded "M0" always implied White wins — wrong for Black checkmates.
        eval_canonical = board_to_canonical_evaluation(board)
        result = {
            "score": eval_canonical["score_str"],
            "cp": -10000 if board.is_checkmate() and board.turn == chess.WHITE else (10000 if board.is_checkmate() else 0),
            "best_move": None,
            "pv": [],
            "depth": 0,
            "eval_canonical": eval_canonical
        }
        analysis_cache[fen_key] = result
        return result

    engine = None
    try:
        engine = await engine_pool.acquire(None)
        # Run search to depth
        logger.info(f"ANALYSIS_DEPTH={depth_limit}")
        result_info = await engine.analyse(
            board,
            chess.engine.Limit(depth=depth_limit, time=0.15)
        )
        
        # Get score and best moves
        score = result_info.get("score")
        depth = result_info.get("depth", depth_limit)
        pv = result_info.get("pv", [])
        
        cp_white = score.white().score()
        eval_canonical = to_canonical_evaluation(score, turn=board.turn)
        # Handle mate formatting
        if score.is_mate():
            mate_val = score.white().mate()
            score_str = f"M{mate_val}" if mate_val >= 0 else f"-M{abs(mate_val)}"
            cp = 10000 if mate_val >= 0 else -10000
        else:
            score_str = f"{cp_white/100:+.2f}" if cp_white is not None else "0.00"
            cp = cp_white if cp_white is not None else 0
 
        best_move = pv[0].text if pv and hasattr(pv[0], 'text') else (pv[0].uci() if pv else None)
        pv_uci = [m.uci() for m in pv]
        
        res = {
            "score": score_str,
            "cp": cp,
            "best_move": best_move,
            "pv": pv_uci,
            "depth": depth,
            "eval_canonical": eval_canonical
        }
        analysis_cache[fen_key] = res
        return res
    except Exception as e:
        logger.error(f"Error during async analysis of FEN {fen}: {e}")
        import traceback
        traceback.print_exc()
        if engine is not None and isinstance(e, (chess.engine.EngineError, chess.engine.EngineTerminatedError)):
            logger.error("[BACKEND] Discarding dead engine in analyze_position")
            asyncio.create_task(engine_pool.replace_dead_engine(engine))
            engine = None
        return {
            "score": "0.00",
            "cp": 0,
            "best_move": None,
            "pv": [],
            "depth": 0,
            "eval_canonical": {"type": "cp", "value": 0, "score_str": "0.00", "white_win_prob": 0.5, "normalized": 0.0}
        }
    finally:
        if engine is not None:
            engine_pool.release(engine, None)

async def analyze_position_review(fen: str, depth_limit: int = 12) -> Dict[str, Any]:
    """Analyzes a FEN with multipv=3 to extract best, second best, and third best move information for game review."""
    fen_key = " ".join(fen.split(" ")[:4])
    if fen_key in analysis_cache and "third_best_cp" in analysis_cache[fen_key]:
        return analysis_cache[fen_key]

    board = chess.Board(fen)
    if board.is_game_over():
        eval_canonical = board_to_canonical_evaluation(board)
        res = {
            "score": eval_canonical["score_str"],
            "cp": 0,
            "best_move": None,
            "second_best_move": None,
            "second_best_cp": None,
            "third_best_move": None,
            "third_best_cp": None,
            "pv": [],
            "depth": 0,
            "eval_canonical": eval_canonical
        }
        analysis_cache[fen_key] = res
        return res

    engine = None
    try:
        logger.info("ENGINE_REQUESTED")
        engine = await engine_pool.acquire(None)
        logger.info("ENGINE_ACQUIRED")
        legal_moves_count = board.legal_moves.count()
        mpv = min(3, legal_moves_count) if legal_moves_count > 0 else 1
        
        logger.info("REVIEW_ANALYSIS_STARTED")
        logger.info(f"ANALYSIS_DEPTH={depth_limit}")
        result_info = await engine.analyse(
            board,
            chess.engine.Limit(depth=depth_limit, time=0.15),
            multipv=mpv
        )
        logger.info("REVIEW_ANALYSIS_COMPLETED")
        
        pv_list = result_info if isinstance(result_info, list) else [result_info]
        pv1 = pv_list[0]
        pv2 = pv_list[1] if len(pv_list) > 1 else None
        pv3 = pv_list[2] if len(pv_list) > 2 else None
        
        # PV1
        score1 = pv1.get("score")
        depth = pv1.get("depth", depth_limit)
        pv1_moves = pv1.get("pv", [])
        
        cp_white1 = score1.white().score()
        if score1.is_mate():
            mate_val1 = score1.white().mate()
            # Format: positive mate_val = White wins ("M3"), negative = Black wins ("-M3")
            score_str1 = f"M{mate_val1}" if mate_val1 >= 0 else f"-M{abs(mate_val1)}"
            cp1 = 10000 if mate_val1 >= 0 else -10000
        else:
            score_str1 = f"{cp_white1/100:+.2f}" if cp_white1 is not None else "0.00"
            cp1 = cp_white1 if cp_white1 is not None else 0
            
        best_move = pv1_moves[0].uci() if pv1_moves else None
        
        # PV2
        second_best_move = None
        cp2 = None
        if pv2:
            score2 = pv2.get("score")
            cp_white2 = score2.white().score()
            if score2.is_mate():
                mate_val2 = score2.white().mate()
                cp2 = 10000 if mate_val2 >= 0 else -10000
            else:
                cp2 = cp_white2 if cp_white2 is not None else 0
            pv2_moves = pv2.get("pv", [])
            second_best_move = pv2_moves[0].uci() if pv2_moves else None
            
        # PV3
        third_best_move = None
        cp3 = None
        if pv3:
            score3 = pv3.get("score")
            cp_white3 = score3.white().score()
            if score3.is_mate():
                mate_val3 = score3.white().mate()
                cp3 = 10000 if mate_val3 >= 0 else -10000
            else:
                cp3 = cp_white3 if cp_white3 is not None else 0
            pv3_moves = pv3.get("pv", [])
            third_best_move = pv3_moves[0].uci() if pv3_moves else None

        # Guard against duplicate best moves
        if second_best_move and second_best_move == best_move:
            logger.warning(f"[BACKEND] [REVIEW] Duplicate move detected! FEN: {fen}, best_move: {best_move}, second_best_move: {second_best_move}")
            second_best_move = None
            cp2 = None
            
        if third_best_move and (third_best_move == best_move or third_best_move == second_best_move):
            third_best_move = None
            cp3 = None
            
        eval_canonical = to_canonical_evaluation(score1, turn=board.turn)
        res = {
            "score": score_str1,
            "cp": cp1,
            "best_move": best_move,
            "second_best_move": second_best_move,
            "second_best_cp": cp2,
            "third_best_move": third_best_move,
            "third_best_cp": cp3,
            "pv": [m.uci() for m in pv1_moves],
            "depth": depth,
            "eval_canonical": eval_canonical
        }
        
        analysis_cache[fen_key] = res
        return res
    except Exception as e:
        logger.error(f"Error in analyze_position_review FEN {fen}: {e}")
        import traceback
        traceback.print_exc()
        if engine is not None and isinstance(e, (chess.engine.EngineError, chess.engine.EngineTerminatedError)):
            logger.error("[BACKEND] Discarding dead engine in analyze_position_review")
            asyncio.create_task(engine_pool.replace_dead_engine(engine))
            engine = None
        return {
            "score": "0.00",
            "cp": 0,
            "best_move": None,
            "second_best_move": None,
            "second_best_cp": None,
            "third_best_move": None,
            "third_best_cp": None,
            "pv": [],
            "depth": 0,
            "eval_canonical": {"type": "cp", "value": 0, "score_str": "0.00", "white_win_prob": 0.5, "normalized": 0.0}
        }
    finally:
        if engine is not None:
            engine_pool.release(engine, None)

@app.post("/api/review")
async def review_game(req: ReviewRequest):
    """
    Analyzes a whole game (either PGN, start FEN, or list of FENs) concurrently.
    Computes move classification, centipawn loss, and accuracies.
    """
    logger.info("REVIEW_REQUEST_RECEIVED")
    engine_pool.active_game_review_requests += 1
    try:
        logger.info(f"PAYLOAD_VALIDATED pgn={req.pgn is not None} fen={req.fen is not None} fens={req.fens is not None}")
        fens = []
        moves_played = []
        
        if req.fens:
            fens = req.fens
        elif req.pgn:
            game = parse_pgn_game(req.pgn)
            if not game:
                raise HTTPException(status_code=400, detail="Invalid PGN format.")
            
            board = game.board()
            fens.append(board.fen())
            for move in game.mainline_moves():
                moves_played.append(move)
                board.push(move)
                fens.append(board.fen())
        elif req.fen:
            fens = [req.fen]
        else:
            raise HTTPException(status_code=400, detail="Must provide pgn, fen, or fens list.")

        if not fens:
            return {"success": True, "moves": []}

        # Parallelize analysis of all positions using the EnginePool with a concurrency semaphore
        sem = asyncio.Semaphore(3)
        
        async def sem_analyze(f):
            async with sem:
                return await analyze_position_review(f, depth_limit=12)
            
        tasks = [sem_analyze(f) for f in fens]
        evaluations = await asyncio.gather(*tasks)

        # Now classify the moves and calculate accuracies
        moves_analysis = []
        white_accuracies = []
        black_accuracies = []
        white_cpl = []
        black_cpl = []

        white_stats = {"accuracy": 0.0, "avg_cpl": 0, "brilliant": 0, "great": 0, "best": 0, "excellent": 0, "good": 0, "book": 0, "inaccuracy": 0, "mistake": 0, "miss": 0, "blunder": 0}
        black_stats = {"accuracy": 0.0, "avg_cpl": 0, "brilliant": 0, "great": 0, "best": 0, "excellent": 0, "good": 0, "book": 0, "inaccuracy": 0, "mistake": 0, "miss": 0, "blunder": 0}

        # If PGN game, we map moves to classifications
        if req.pgn and len(fens) > 1:
            uci_moves_list = [m.uci() for m in moves_played]
            openings_list = opening_detector.get_opening_for_game(uci_moves_list)
            has_left_book = False

            for i in range(len(moves_played)):
                move = moves_played[i]
                fen_before = fens[i]
                board_before = chess.Board(fen_before)
                color = board_before.turn # True for White, False for Black

                eval_before = evaluations[i]
                eval_after = evaluations[i+1]

                # Determine opening status from sequence matching results
                is_book = (openings_list[i+1].get("status") == "Book") if i+1 < len(openings_list) else False
                if has_left_book:
                    is_book = False
                elif not is_book:
                    has_left_book = True

                # Centipawn loss (oriented relative to color perspective)
                if color == chess.WHITE:
                    cpl = max(0, eval_before["cp"] - eval_after["cp"])
                else:
                    cpl = max(0, eval_after["cp"] - eval_before["cp"])

                # Win percentage loss
                win_before = score_to_win_percent(
                    cp=eval_before["cp"], 
                    color=color, 
                    score_str=eval_before.get("score"),
                    turn_color=color
                )
                win_after = score_to_win_percent(
                    cp=eval_after["cp"], 
                    color=color, 
                    score_str=eval_after.get("score"),
                    turn_color=not color
                )
                loss = win_percent_loss(win_before, win_after)

                prev_cls = moves_analysis[i-1]["classification"] if i > 0 else None
                classification, reasons, diagnostics = classify_move(
                    board_before=board_before,
                    move_played=move,
                    played_move_cp=eval_after["cp"],
                    best_move_cp=eval_before["cp"],
                    second_best_move_cp=eval_before.get("second_best_cp"),
                    third_best_move_cp=eval_before.get("third_best_cp"),
                    is_book_move=is_book,
                    pv_after=eval_after.get("pv"),
                    played_move_score_str=eval_after.get("score"),
                    best_move_score_str=eval_before.get("score"),
                    best_move_uci=eval_before.get("best_move"),
                    move_number=i + 1,
                    depth=eval_after.get("depth", 12),
                    prev_move_classification=prev_cls
                )

                is_forced = diagnostics.get("is_forced", False)
                is_mate_move = False
                for score_dict in [eval_before, eval_after]:
                    s = score_dict.get("score")
                    if s and ("M" in str(s) or "m" in str(s) or str(s) in ("W", "B", "-M0", "M0")):
                        is_mate_move = True

                # Move accuracy calculation based on win% loss (loss) instead of cpl
                if not is_book and not is_forced:
                    accuracy = calculate_move_accuracy(loss)
                    if color == chess.WHITE:
                        white_accuracies.append(accuracy)
                        if not is_mate_move:
                            white_cpl.append(cpl)
                    else:
                        black_accuracies.append(accuracy)
                        if not is_mate_move:
                            black_cpl.append(cpl)
                else:
                    accuracy = 100.0
                    if is_forced:
                        if color == chess.WHITE:
                            white_accuracies.append(100.0)
                        else:
                            black_accuracies.append(100.0)

                # Record stats
                player_stats = white_stats if color == chess.WHITE else black_stats
                cls_key = classification.lower().replace(" ", "_")
                if cls_key == "forced":
                    cls_key = "best"
                if cls_key in player_stats:
                    player_stats[cls_key] += 1

                # Game Phase detection
                phase = diagnostics.get("game_phase", "Middlegame")
                op_state = openings_list[i+1].get("status") if i+1 < len(openings_list) else "Book"

                # Compute running White and Black accuracies at this point in the game
                running_white = round(sum(white_accuracies) / len(white_accuracies), 1) if white_accuracies else 100.0
                running_black = round(sum(black_accuracies) / len(black_accuracies), 1) if black_accuracies else 100.0

                # Log running accuracy audit record for this ply
                logger.info(
                    f"[RUNNING_ACCURACY_AUDIT] Ply {i + 1} | Player: {'White' if color == chess.WHITE else 'Black'} | "
                    f"SAN: {board_before.san(move)} (UCI: {move.uci()}) | Game Phase: {phase} | "
                    f"Accuracy Contribution: {round(accuracy, 1)}% | "
                    f"Running White Accuracy: {running_white}% | Running Black Accuracy: {running_black}% | "
                    f"Classification: {classification} (Reason: {'; '.join(reasons)})"
                )

                # Enrich internal diagnostics object returned from classify_move
                diagnostics["accuracy"] = round(accuracy, 1)
                diagnostics["running_white_accuracy"] = running_white
                diagnostics["running_black_accuracy"] = running_black
                diagnostics["expected_outcome_before"] = diagnostics["win_before"]
                diagnostics["expected_outcome_after"] = diagnostics["win_after"]
                diagnostics["win_loss"] = diagnostics["win_prob_loss"]

                # Additional keys to match original diagnostics fields expected by frontend UI
                diagnostics["best_eval"] = diagnostics["eval_before"]
                diagnostics["played_eval"] = diagnostics["eval_after"]
                diagnostics["second_best_eval"] = format_cp_to_score_str(eval_before.get("second_best_cp"))
                diagnostics["third_best_eval"] = format_cp_to_score_str(eval_before.get("third_best_cp"))
                diagnostics["best_move"] = eval_before.get("best_move")
                diagnostics["second_best_move"] = eval_before.get("second_best_move")
                diagnostics["third_best_move"] = eval_before.get("third_best_move")
                diagnostics["mate_score"] = diagnostics["mate_after"]
                diagnostics["opening_state"] = op_state

                moves_analysis.append({
                    "move_number": (i // 2) + 1,
                    "color": "white" if color == chess.WHITE else "black",
                    "san": board_before.san(move),
                    "uci": move.uci(),
                    "fen_before": fen_before,
                    "fen_after": fens[i+1],
                    "eval": eval_after["score"],
                    "eval_canonical": eval_after.get("eval_canonical"),
                    "best_move": eval_before["best_move"],
                    "second_best_move": eval_before.get("second_best_move"),
                    "classification": classification,
                    "reasons": reasons,
                    "accuracy": round(accuracy, 1),
                    "opening": openings_list[i+1] if i+1 < len(openings_list) else {"eco": "", "name": "", "variation": "", "status": "Book"},
                    "diagnostics": diagnostics
                })

        # Compute overall accuracies
        white_stats["accuracy"] = round(sum(white_accuracies) / len(white_accuracies), 1) if white_accuracies else 100.0
        black_stats["accuracy"] = round(sum(black_accuracies) / len(black_accuracies), 1) if black_accuracies else 100.0

        # Compute average CPL
        white_stats["avg_cpl"] = round(sum(white_cpl) / len(white_cpl)) if white_cpl else 0
        black_stats["avg_cpl"] = round(sum(black_cpl) / len(black_cpl)) if black_cpl else 0

        # Sanity checks and bounds warning logs (Phase 4)
        for color_str, stats_dict in [("White", white_stats), ("Black", black_stats)]:
            acc = stats_dict["accuracy"]
            cpl_val = stats_dict["avg_cpl"]
            if not (0.0 <= acc <= 100.0) or cpl_val > 2000.0 or cpl_val < 0.0:
                logger.warning(
                    f"[ACCURACY_SANITY_WARNING] Out-of-bounds metrics detected for {color_str}! "
                    f"Accuracy: {acc}% (expected 0-100) | Avg CPL: {cpl_val} (expected 0-2000). "
                    f"FEN of last position: {fens[-1] if fens else 'N/A'}"
                )
            # Cap to safe limits
            stats_dict["accuracy"] = max(0.0, min(100.0, acc))
            stats_dict["avg_cpl"] = max(0, min(2000, cpl_val))

        # Get opening details
        final_board = chess.Board(fens[-1])
        uci_moves_list = [m.uci() for m in moves_played] if moves_played else None
        opening = opening_detector.get_opening(final_board, uci_moves=uci_moves_list)

        res_payload = {
            "success": True,
            "opening": opening,
            "evaluations": evaluations,
            "moves": moves_analysis,
            "stats": {
                "white": white_stats,
                "black": black_stats
            }
        }
        logger.info(f"[REVIEW_JSON_PAYLOAD] White Accuracy: {white_stats['accuracy']}% | Black Accuracy: {black_stats['accuracy']}% | Moves Count: {len(moves_analysis)}")
        logger.info("REVIEW_RESPONSE_SENT")
        return res_payload

    finally:
        engine_pool.active_game_review_requests -= 1

def log_backend_structured(stage: str, gen_id: Optional[int], move_number: Optional[int], source: str, fen: str, details: dict):
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int(time.time() % 1 * 1000):03d}Z"
    logger.debug(f"[BACKEND_TELEMETRY] [{timestamp}] [Gen:{gen_id}] [Move:{move_number}] [Source:{source}] [Stage:{stage}] FEN: {fen} | {details}")

def get_pool_telemetry() -> dict:
    total_searches = engine_pool.search_count
    avg_duration = (engine_pool.total_search_duration / total_searches) if total_searches > 0 else 0.0
    
    total_waits = engine_pool.queue_wait_count
    avg_wait = (engine_pool.total_queue_wait_time / total_waits) if total_waits > 0 else 0.0
    
    is_healthy = len(engine_pool.engines) == engine_pool.size and all(not t.is_closing() for t, _ in engine_pool.engines)
    
    return {
        "engines_available": engine_pool.pool.qsize(),
        "engines_in_use": len(engine_pool.engines) - engine_pool.pool.qsize(),
        "active_searches": engine_pool.active_searches,
        "cancelled_searches": engine_pool.cancelled_searches,
        "completed_searches": engine_pool.completed_searches,
        "avg_search_duration": round(avg_duration, 2),
        "avg_queue_wait_time": round(avg_wait, 3),
        "cancellation_count": engine_pool.cancellation_count,
        "engine_restart_count": engine_pool.engine_restart_count,
        "pool_health": "Healthy" if is_healthy else "Recovering"
    }

async def ws_analysis_stream(websocket: WebSocket, fen: str, target_depth: int = 18, gen_id: Optional[int] = None, move_number: Optional[int] = None, source: str = "unknown", session_state: Optional[Dict[str, Any]] = None, multipv: int = 2):
    """Coroutine that leases an engine and streams progressive MultiPV analysis over WebSocket."""
    log_backend_structured("search_task_spawned", gen_id, move_number, source, fen, {"target_depth": target_depth, "multipv": multipv})
    engine_pool.active_live_analysis_requests += 1
    
    board = chess.Board(fen)
    fen_key = " ".join(fen.split(" ")[:4])

    # ── Terminal position guard ─────────────────────────────────────────────────
    # Never send a terminal position to Stockfish.  The engine will happily search
    # checkmate/stalemate FENs and return nonsensical scores/moves.  Instead, emit
    # a structured terminal_position packet so the frontend can display the correct
    # result banner without showing depth / NPS / arrows.
    if board.is_game_over():
        canonical = board_to_canonical_evaluation(board)
        if board.is_checkmate():
            # The side that just moved delivered mate — that side's opponent is the
            # current turn (the one about to move has no legal moves).
            loser  = "White" if board.turn == chess.WHITE else "Black"
            winner = "Black" if loser == "White" else "White"
            reason = f"Checkmate! {winner} wins."
            score_str = canonical.get("score_str", "-M0" if loser == "White" else "M0")
        elif board.is_stalemate():
            reason = "Draw by Stalemate."
            score_str = "Draw"
        elif board.is_insufficient_material():
            reason = "Draw by Insufficient Material."
            score_str = "Draw"
        elif board.is_seventyfive_moves():
            reason = "Draw by 75-move rule."
            score_str = "Draw"
        elif board.is_fivefold_repetition():
            reason = "Draw by Fivefold Repetition."
            score_str = "Draw"
        else:
            reason = "Draw."
            score_str = "Draw"

        log_backend_structured("terminal_position", gen_id, move_number, source, fen, {"reason": reason})
        try:
            await websocket.send_json({
                "type": "terminal_position",
                "fen": fen,
                "gen_id": gen_id,
                "reason": reason,
                "score": score_str,
                "eval_canonical": canonical,
                "best_move": None,
                "second_best_move": None,
                "pv": [],
                "depth": 0,
                "nps": 0,
                "nodes": 0,
                "telemetry": get_pool_telemetry()
            })
        except Exception:
            pass  # WebSocket may already be closing
        return
    # ─────────────────────────────────────────────────────────────────────────────
    
    legal_moves_count = len(list(board.legal_moves))
    expected_multipv = min(multipv, legal_moves_count) if legal_moves_count > 0 else 1

    last_emitted_depth = 0
    current_depth_info = {
        "depth": 0,
        "best_moves": {m: None for m in range(1, expected_multipv + 1)},
        "pvs": {m: [] for m in range(1, expected_multipv + 1)},
        "scores": {m: None for m in range(1, expected_multipv + 1)},
        "nps": None,
        "nodes": None
    }
    analysis = None
    
    has_logged_first_packet = False
    engine = None
    start_time = time.time()
    engine_pool.active_searches += 1
    completed = False
    
    try:
        log_backend_structured("engine_acquisition_start", gen_id, move_number, source, fen, {})
        t0 = time.time()
        engine = await engine_pool.acquire(gen_id=gen_id)
        if session_state is not None:
            session_state["engine"] = engine
        dt = time.time() - t0
        engine_pool.total_queue_wait_time += dt
        engine_pool.queue_wait_count += 1
        
        log_backend_structured("engine_acquisition_success", gen_id, move_number, source, fen, {
            "queue_wait_time": round(dt, 3),
            "pool_telemetry": get_pool_telemetry()
        })
        
        log_backend_structured("stockfish_search_start", gen_id, move_number, source, fen, {})
        logger.debug("LINE_1: stockfish_search_start finished")
        
        logger.debug(f"LINE_2: target_depth={target_depth}")
        logger.debug(f"ANALYSIS_DEPTH={target_depth}")
        
        logger.debug("LINE_3: calling engine.analysis")
        logger.debug(f"LINE_4: variables used: board={board}, multipv={multipv}")
        analysis = await engine.analysis(board, multipv=multipv)
        logger.debug("LINE_5: engine.analysis call completed")
        logger.debug(f"LINE_6: analysis object: {analysis}")
        
        try:
            logger.debug("LINE_7: entering try block for analysis stream iteration")
            logger.debug("LINE_8: starting async for info in analysis loop")
            
            async def emit_buffered_info(d_info):
                nonlocal has_logged_first_packet
                depth_val = d_info["depth"]
                scores_map = d_info["scores"]
                moves_map = d_info["best_moves"]
                pvs_map = d_info["pvs"]
                nps_val = d_info["nps"]
                nodes_val = d_info["nodes"]
                
                score1 = scores_map.get(1)
                if score1 is None:
                    return
                    
                b1 = moves_map.get(1)
                b2 = moves_map.get(2)
                
                if b2 is None:
                    if expected_multipv == 1:
                        logger.info(f"[BACKEND] [MULTIPV] No second PV line expected (only 1 legal move or multipv={multipv}). FEN: {fen}")
                    else:
                        logger.info(f"[BACKEND] [MULTIPV] Second PV line missing at depth {depth_val} (unfinished depth iteration). FEN: {fen}")
                
                pv_uci_1 = [m.uci() for m in pvs_map.get(1, [])]
                pv_uci_2 = [m.uci() for m in pvs_map.get(2, [])]
                
                score2 = scores_map.get(2)
                second_score_str = None
                if score2 is not None:
                    cp_white2 = score2.white().score()
                    if score2.is_mate():
                        mate_val2 = score2.white().mate()
                        second_score_str = f"M{mate_val2}"
                    else:
                        second_score_str = f"{cp_white2/100:+.2f}" if cp_white2 is not None else "0.00"
                
                # Guard against duplicate best moves
                if b2 and b2 == b1:
                    b2 = None
                    second_score_str = None
                    pv_uci_2 = []
                    
                cp_white = score1.white().score()
                if score1.is_mate():
                    mate_val = score1.white().mate()
                    score_str = f"M{mate_val}"
                else:
                    score_str = f"{cp_white/100:+.2f}" if cp_white is not None else "0.00"
                    
                eval_canonical = to_canonical_evaluation(score1, turn=board.turn)
                payload = {
                    "type": "analysis",
                    "fen": fen,
                    "gen_id": gen_id,
                    "depth": depth_val,
                    "score": score_str,
                    "best_score": score_str,
                    "second_score": second_score_str,
                    "best_move": b1,
                    "second_best_move": b2,
                    "pv": pv_uci_1,
                    "best_pv": pv_uci_1,
                    "pv2": pv_uci_2,
                    "second_pv": pv_uci_2,
                    "nps": nps_val,
                    "nodes": nodes_val,
                    "telemetry": get_pool_telemetry(),
                    "eval_canonical": eval_canonical
                }
                
                log_backend_structured("depth_update", gen_id, move_number, source, fen, {
                    "depth": depth_val,
                    "score": score_str,
                    "best_score": score_str,
                    "second_score": second_score_str,
                    "nps": nps_val,
                    "nodes": nodes_val,
                    "best_move": b1,
                    "second_best_move": b2
                })
                
                await websocket.send_json(payload)
                has_logged_first_packet = True
                
                if depth_val >= 5:
                    analysis_cache[fen_key] = {
                        "score": score_str,
                        "best_score": score_str,
                        "second_score": second_score_str,
                        "cp": cp_white if cp_white is not None else (10000 if score1.is_mate() and score1.white().mate() > 0 else -10000),
                        "best_move": b1,
                        "second_best_move": b2,
                        "pv": pv_uci_1,
                        "best_pv": pv_uci_1,
                        "pv2": pv_uci_2,
                        "second_pv": pv_uci_2,
                        "depth": depth_val,
                        "eval_canonical": eval_canonical
                    }

            async for info in analysis:
                logger.debug(f"LINE_9: loop body started, info: {info}")
                info_depth = info.get("depth", 0)
                nps = info.get("nps")
                nodes = info.get("nodes")
                multipv_val = info.get("multipv", 1)
                logger.debug(f"LINE_11: variables: depth={info_depth}, nps={nps}, nodes={nodes}, multipv={multipv_val}")
                
                # Check for depth increase
                if info_depth > current_depth_info["depth"]:
                    if current_depth_info["depth"] > last_emitted_depth:
                        await emit_buffered_info(current_depth_info)
                        last_emitted_depth = current_depth_info["depth"]
                    
                    # Initialize next depth's info
                    current_depth_info = {
                        "depth": info_depth,
                        "best_moves": {m: None for m in range(1, expected_multipv + 1)},
                        "pvs": {m: [] for m in range(1, expected_multipv + 1)},
                        "scores": {m: None for m in range(1, expected_multipv + 1)},
                        "nps": nps,
                        "nodes": nodes
                    }
                
                current_depth_info["nps"] = info.get("nps", current_depth_info["nps"])
                current_depth_info["nodes"] = info.get("nodes", current_depth_info["nodes"])
                
                if "pv" in info:
                    pv = info["pv"]
                    if pv is not None:
                        current_depth_info["pvs"][multipv_val] = pv
                        if len(pv) > 0:
                            current_depth_info["best_moves"][multipv_val] = pv[0].uci()
                
                if "score" in info:
                    score = info["score"]
                    if score is not None:
                        current_depth_info["scores"][multipv_val] = score
                
                # Emit conditions
                # All expected multipv lines must be present for the current depth to emit
                has_all_expected_pvs = all(
                    current_depth_info["best_moves"].get(m) is not None and current_depth_info["scores"].get(m) is not None
                    for m in range(1, expected_multipv + 1)
                )
                
                if has_all_expected_pvs:
                    await emit_buffered_info(current_depth_info)
                    last_emitted_depth = info_depth
                
                if info_depth >= target_depth:
                    completed = True
                    log_backend_structured("search_completed", gen_id, move_number, source, fen, {"depth": info_depth})
                    break
            
            # Post-loop cleanup: emit final remaining depth info if not already emitted
            if current_depth_info["depth"] > last_emitted_depth:
                await emit_buffered_info(current_depth_info)
        finally:
            if analysis is not None:
                analysis.stop()
            
    except asyncio.CancelledError:
        engine_pool.cancelled_searches += 1
        engine_pool.cancellation_count += 1
        log_backend_structured("search_cancelled", gen_id, move_number, source, fen, {"duration": round(time.time() - start_time, 2)})
        raise
    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        logger.error(f"[BACKEND] [STREAM_ERROR] Exception in ws_analysis_stream: {e}\n{tb_str}")
        log_backend_structured("search_error", gen_id, move_number, source, fen, {"error": str(e), "traceback": tb_str})
        if engine is not None and isinstance(e, (chess.engine.EngineError, chess.engine.EngineTerminatedError)):
            asyncio.create_task(engine_pool.replace_dead_engine(engine))
            engine = None
    finally:
        engine_pool.active_searches -= 1
        engine_pool.active_live_analysis_requests -= 1
        duration = time.time() - start_time
        engine_pool.total_search_duration += duration
        engine_pool.search_count += 1
        
        if completed:
            engine_pool.completed_searches += 1
            
        if engine is not None:
            if session_state is None or session_state.get("engine") == engine:
                engine_pool.release(engine, gen_id=gen_id)
                if session_state is not None:
                    session_state["engine"] = None
                log_backend_structured("engine_release", gen_id, move_number, source, fen, {
                    "duration": round(duration, 2),
                    "pool_telemetry": get_pool_telemetry()
                })
            else:
                logger.warning(f"[BACKEND] Engine {engine} was replaced/discarded during cancellation timeout. Not releasing back to pool.")

@app.websocket("/api/analyze")
async def websocket_endpoint(websocket: WebSocket):
    logger.info("WS_CONNECTION_REQUEST")
    try:
        await websocket.accept()
        logger.info("WS_CONNECTION_ACCEPTED")
        logger.info("WebSocket connection established for real-time analysis.")
    except Exception as e:
        logger.error(f"WS_CONNECTION_EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return
    
    session_state = {"engine": None}
    active_task: Optional[asyncio.Task] = None
    # Track the gen_id / fen of the task currently running so cancellation logs
    # correctly attribute which search is being cancelled, not the new request.
    active_task_gen_id: Optional[int] = None
    active_task_fen: str = ""
    active_task_move_number: Optional[int] = None
    
    try:
        while True:
            # Receive analysis request
            data = await websocket.receive_json()
            fen = data.get("fen")
            target_depth = int(data.get("depth", 18))
            multipv = int(data.get("multipv", 2))
            uci_moves = data.get("uci_moves")
            is_fen_load = bool(data.get("is_fen_load", False))
            gen_id = data.get("gen_id")
            move_number = data.get("move_number")
            source = data.get("source", "unknown")
            
            if not fen:
                continue
            
            # Reconstruct FEN from uci_moves to guarantee all moves are applied
            if uci_moves and not is_fen_load:
                try:
                    temp_board = chess.Board()
                    for move_uci in uci_moves:
                        temp_board.push_uci(move_uci)
                    reconstructed_fen = temp_board.fen()
                    # Dev-time assertion/warning if FEN doesn't match client-provided FEN
                    if reconstructed_fen != fen:
                        logger.warning(
                            f"[FEN_DISCREPANCY] [Gen:{gen_id}] [Move:{move_number}] FEN mismatch!\n"
                            f"  Client FEN:        {fen}\n"
                            f"  Reconstructed FEN: {reconstructed_fen}"
                        )
                    fen = reconstructed_fen
                except Exception as e:
                    logger.error(f"[FEN_RECONSTRUCTION_ERROR] Failed to push uci_moves: {e}")

            # Check pool health and recover if needed before processing request
            await engine_pool.check_and_recover_pool()
            
            log_backend_structured("websocket_receive", gen_id, move_number, source, fen, {
                "target_depth": target_depth,
                "uci_moves": uci_moves,
                "is_fen_load": is_fen_load
            })
            
            # Cancel any running analysis task for this connection.
            # Attribute the cancellation log to the OLD task's gen_id/fen so telemetry
            # shows "cancelled Gen N" rather than the new request's Gen N+1.
            if active_task and not active_task.done():
                log_backend_structured(
                    "engine_cancellation_start",
                    active_task_gen_id, active_task_move_number, source, active_task_fen, {
                        "cancelled_by_gen_id": gen_id
                    }
                )
                active_task.cancel()
                try:
                    # Wait up to 2.0s for clean cancellation and release
                    await asyncio.wait_for(active_task, timeout=2.0)
                except asyncio.TimeoutError:
                    logger.warning("[BACKEND] Previous analysis task cancellation timed out after 2.0s. Forcefully replacing engine.")
                    log_backend_structured(
                        "engine_cancellation_timeout",
                        active_task_gen_id, active_task_move_number, source, active_task_fen, {
                            "cancelled_by_gen_id": gen_id
                        }
                    )
                    stuck_engine = session_state.get("engine")
                    if stuck_engine:
                        asyncio.create_task(engine_pool.replace_dead_engine(stuck_engine))
                    # Replaced: clear session state so the stuck task's finally block doesn't release it
                    session_state["engine"] = None
                except asyncio.CancelledError:
                    log_backend_structured(
                        "engine_cancellation_success",
                        active_task_gen_id, active_task_move_number, source, active_task_fen, {
                            "cancelled_by_gen_id": gen_id
                        }
                    )
            
            try:
                chess.Board(fen)
            except Exception:
                await websocket.send_json({"type": "error", "message": "Invalid FEN string", "gen_id": gen_id})
                continue
                
            # Perform instant transposition and sequence-aware opening detection
            board = chess.Board(fen)
            try:
                op = opening_detector.get_opening(board, uci_moves=uci_moves, is_fen_load=is_fen_load)
            except Exception as op_err:
                logger.error(f"[BACKEND] Opening detection error (non-fatal): {op_err}")
                op = {"eco": "", "name": "Opening detection error", "variation": "", "status": "Unavailable"}
            
            log_backend_structured("opening_detection", gen_id, move_number, source, fen, {"opening": op})
            
            await websocket.send_json({
                "type": "opening",
                "gen_id": gen_id,
                "eco": op.get("eco", ""),
                "name": op.get("name", ""),
                "variation": op.get("variation", ""),
                "status": op.get("status", "Book"),
                "telemetry": get_pool_telemetry()
            })
            
            # check memory cache for this position
            fen_key = " ".join(fen.split(" ")[:4])
            if fen_key in analysis_cache:
                cached = analysis_cache[fen_key]
                log_backend_structured("cache_hit", gen_id, move_number, source, fen, {"depth": cached["depth"]})
                # Send cached results immediately
                await websocket.send_json({
                    "type": "analysis_cached",
                    "fen": fen,
                    "gen_id": gen_id,
                    "depth": cached["depth"],
                    "score": cached["score"],
                    "best_score": cached.get("best_score", cached["score"]),
                    "second_score": cached.get("second_score"),
                    "best_move": cached["best_move"],
                    "second_best_move": cached.get("second_best_move"),
                    "pv": cached["pv"],
                    "best_pv": cached.get("best_pv", cached["pv"]),
                    "pv2": cached.get("pv2", []),
                    "second_pv": cached.get("second_pv", cached.get("pv2", [])),
                    "telemetry": get_pool_telemetry(),
                    "eval_canonical": cached.get("eval_canonical")
                })
                
                # If cached depth is already high, we don't need to re-run Stockfish
                if cached["depth"] >= target_depth:
                    continue
 
            # Start background async analysis task
            active_task = asyncio.create_task(
                ws_analysis_stream(websocket, fen, target_depth, gen_id, move_number, source, session_state, multipv)
            )
            def handle_task_done(t):
                try:
                    t.result()
                except asyncio.CancelledError:
                    pass
                except Exception as ex:
                    logger.exception(f"[BACKEND] [WS_TASK_ERROR] Exception in analysis task: {ex}")
            active_task.add_done_callback(handle_task_done)
            
            # Record this task's identity for correct cancellation attribution on the next request
            active_task_gen_id = gen_id
            active_task_fen = fen
            active_task_move_number = move_number
            
    except WebSocketDisconnect:
        logger.info("WS_CONNECTION_CLOSED")
        logger.info("[BACKEND] WebSocket disconnected.")
    except Exception as e:
        logger.error(f"WS_CONNECTION_EXCEPTION: {e}")
        logger.error(f"WebSocket error: {e}")
    finally:
        logger.info("WS_CONNECTION_CLOSED")
        # Cancel any active tasks to clean up resources
        if active_task and not active_task.done():
            active_task.cancel()
            try:
                await asyncio.wait_for(active_task, timeout=0.5)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
        logger.info("WebSocket connection cleanup finished.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
