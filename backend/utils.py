import math
import logging
import chess
import chess.pgn
import aiohttp
from typing import List, Dict, Any, Optional
from config import ClassificationConfig

logger = logging.getLogger("mouseslip.utils")

def to_canonical_evaluation(score: chess.engine.Score, turn: Optional[chess.Color] = None) -> Dict[str, Any]:
    """
    Converts a PovScore (or any chess.engine.Score) into a unified canonical evaluation dictionary.
    Always expressed from White's perspective:
    - positive cp indicates White advantage
    - negative cp indicates Black advantage
    - mate is represented as terminal evaluations while preserving mate distance
    - win probability is from White's perspective (0.0 to 1.0)
    - normalized score is scaled between -10.0 and +10.0 (CP is scaled as CP/100, Mate as terminal score)
    """
    score_turn = score.turn if hasattr(score, 'turn') else (turn if turn is not None else chess.WHITE)
    white_score = score.white()
    
    if white_score.is_mate():
        mate_val = white_score.mate()
        if mate_val is None:
            mate_val = 0
            
        if mate_val == 0:
            is_white_mated = (score_turn == chess.WHITE)
            score_str = "-M0" if is_white_mated else "M0"
            normalized = -10.0 if is_white_mated else 10.0
            white_win_prob = 0.0 if is_white_mated else 1.0
        else:
            if mate_val > 0:
                score_str = f"M{mate_val}"
                normalized = 10.0 - min(9, mate_val) * 0.1
                white_win_prob = 1.0 - min(20, mate_val) * 0.001
            else:
                score_str = f"-M{abs(mate_val)}"
                normalized = -10.0 + min(9, abs(mate_val)) * 0.1
                white_win_prob = 0.0 + min(20, abs(mate_val)) * 0.001
                
        return {
            "type": "mate",
            "value": mate_val,
            "score_str": score_str,
            "white_win_prob": white_win_prob,
            "normalized": normalized
        }
    else:
        cp = white_score.score()
        if cp is None:
            cp = 0
            
        score_str = f"{cp/100:+.2f}" if cp != 0 else "0.00"
        white_win_prob = centipawns_to_win_percent(cp) / 100.0
        normalized = max(-9.0, min(9.0, cp / 100.0))
        
        return {
            "type": "cp",
            "value": cp,
            "score_str": score_str,
            "white_win_prob": white_win_prob,
            "normalized": normalized
        }

def board_to_canonical_evaluation(board: chess.Board) -> Dict[str, Any]:
    """
    Computes a canonical evaluation for terminal board states without running Stockfish.
    """
    if board.is_game_over():
        if board.is_checkmate():
            is_white_mated = (board.turn == chess.WHITE)
            score_str = "-M0" if is_white_mated else "M0"
            normalized = -10.0 if is_white_mated else 10.0
            white_win_prob = 0.0 if is_white_mated else 1.0
            return {
                "type": "mate",
                "value": 0,
                "score_str": score_str,
                "white_win_prob": white_win_prob,
                "normalized": normalized
            }
        else:
            return {
                "type": "cp",
                "value": 0,
                "score_str": "Draw",
                "white_win_prob": 0.5,
                "normalized": 0.0
            }
    return {
        "type": "cp",
        "value": 0,
        "score_str": "0.00",
        "white_win_prob": 0.5,
        "normalized": 0.0
    }

def score_to_cp(score: chess.engine.Score, color: chess.Color) -> int:
    """
    Converts a chess.engine.Score object to a relative centipawn value.
    Always returns the value from the perspective of the given color (higher is better).
    Mate scores are converted to high centipawn values.
    """
    if score.is_mate():
        mate_moves = score.mate()
        if mate_moves is None:
            return 10000 if score.turn == color else -10000
        # Positive mate_moves means active player mates in N.
        # We orient it from White's perspective, then relative to color.
        # If score is relative to white, score.white() returns PovScore.
        mate_moves_from_color = score.white().mate() if color == chess.WHITE else -score.white().mate()
        if mate_moves_from_color > 0:
            return 10000 - mate_moves_from_color * 100
        else:
            return -10000 - mate_moves_from_color * 100
            
    cp = score.white().score()
    if cp is None:
        return 0
    return cp if color == chess.WHITE else -cp

def parse_pgn_game(pgn_text: str) -> Optional[chess.pgn.Game]:
    """Parses PGN text into a chess.pgn.Game object."""
    import io
    try:
        game = chess.pgn.read_game(io.StringIO(pgn_text))
        return game
    except Exception as e:
        logger.error(f"Error parsing PGN: {e}")
        return None

async def fetch_chess_com_games(username: str) -> List[Dict[str, Any]]:
    """
    Fetches the last month of public games for a Chess.com user.
    Returns a list of structured game info items.
    """
    headers = {"User-Agent": "MouseSlip Chess Analyzer (contact: info@mouseslip.com)"}
    async with aiohttp.ClientSession() as session:
        url = f"https://api.chess.com/pub/player/{username}/games/archives"
        logger.info(f"Fetching Chess.com archives for {username}")
        try:
            async with session.get(url, headers=headers, timeout=10) as response:
                if response.status == 404:
                    raise ValueError(f"Chess.com user '{username}' not found.")
                if response.status != 200:
                    raise ValueError(f"Failed to fetch archives: HTTP {response.status}")
                
                data = await response.json()
                archives = data.get("archives", [])
                if not archives:
                    return []
                
                # Fetch games from the latest archive
                latest_archive_url = archives[-1]
                logger.info(f"Fetching games from latest archive: {latest_archive_url}")
                async with session.get(latest_archive_url, headers=headers, timeout=10) as games_response:
                    if games_response.status != 200:
                        raise ValueError(f"Failed to fetch games from archive: HTTP {games_response.status}")
                    
                    games_data = await games_response.json()
                    raw_games = games_data.get("games", [])
                    
                    processed_games = []
                    # Process in reverse order so newest games are first
                    for idx, rg in enumerate(reversed(raw_games)):
                        if idx >= 15: # Limit to 15 recent games
                            break
                        
                        white = rg.get("white", {})
                        black = rg.get("black", {})
                        
                        processed_games.append({
                            "url": rg.get("url"),
                            "uuid": rg.get("uuid", str(idx)),
                            "white": {
                                "username": white.get("username", "Unknown"),
                                "rating": white.get("rating", 0),
                                "result": white.get("result", "unknown")
                            },
                            "black": {
                                "username": black.get("username", "Unknown"),
                                "rating": black.get("rating", 0),
                                "result": black.get("result", "unknown")
                            },
                            "time_class": rg.get("time_class", "unknown"),
                            "time_control": rg.get("time_control", "unknown"),
                            "pgn": rg.get("pgn", ""),
                            "fen": rg.get("fen", ""),
                            "end_time": rg.get("end_time")
                        })
                    return processed_games
        except Exception as e:
            logger.error(f"Error fetching Chess.com games: {e}")
            raise e

def get_material_value(board: chess.Board) -> Dict[chess.Color, int]:
    """Calculates the total material value of pieces on the board for White and Black."""
    values = {
        chess.PAWN: 100,
        chess.KNIGHT: 300,
        chess.BISHOP: 300,
        chess.ROOK: 500,
        chess.QUEEN: 900
    }
    
    white_value = 0
    black_value = 0
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece and piece.piece_type != chess.KING:
            val = values.get(piece.piece_type, 0)
            if piece.color == chess.WHITE:
                white_value += val
            else:
                black_value += val
    return {chess.WHITE: white_value, chess.BLACK: black_value}

def centipawns_to_win_percent(centipawns: float) -> float:
    """
    Converts a centipawn evaluation (from White's perspective) to an
    estimated win percentage (0-100) for White using the Lichess win% formula:
    Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
    """
    try:
        if centipawns >= 2000.0:
            return 100.0
        elif centipawns <= -2000.0:
            return 0.0
        cp = centipawns
        win_percent = 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * cp)) - 1.0)
        return max(0.0, min(100.0, win_percent))
    except Exception:
        return 50.0

def score_to_win_percent(cp: int, color: chess.Color, score_str: Optional[str] = None, turn_color: Optional[chess.Color] = None) -> float:
    """Converts centipawns and mate scores to win% relative to color. Handles M0 checkmate states using turn_color."""
    score_str_str = str(score_str) if score_str is not None else None
    
    if score_str_str == "M0" or score_str_str == "-M0":
        if turn_color is not None:
            return 0.0 if color == turn_color else 100.0
        is_black_win = score_str_str.startswith("-")
        return 0.0 if (color == chess.WHITE) == is_black_win else 100.0
        
    if score_str_str and ("M" in score_str_str or "m" in score_str_str):
        try:
            is_negative = score_str_str.startswith("-")
            mate_val = int(score_str_str.replace("-", "").replace("+", "").replace("M", "").replace("m", ""))
            if is_negative:
                win_percent = 0.0 + min(20, mate_val) * 1.0
            else:
                win_percent = 100.0 - min(20, mate_val) * 1.0
        except ValueError:
            win_percent = 100.0 if cp >= 0 else 0.0
    else:
        if abs(cp) >= 9000:
            win_percent = 100.0 if cp > 0 else 0.0
        else:
            win_percent = centipawns_to_win_percent(cp)
            
    # Orient relative to active turn color
    if color == chess.BLACK:
        return 100.0 - win_percent
    return win_percent

def win_percent_loss(win_percent_before: float, win_percent_after: float) -> float:
    """
    Positive value = the move lost win probability (worse move).
    Clamp at 0 — a move that IMPROVES the position never has negative loss.
    """
    return max(0.0, win_percent_before - win_percent_after)

def move_accuracy(win_loss: float) -> float:
    """
    Calculates accuracy using the Chess.com-calibrated exponential decay curve:
    Per-move accuracy = 103.1668 * exp(-0.04354 * winPercentLost) - 3.1669
    """
    if win_loss <= 0.0001:
        return 100.0
    accuracy = 103.1668 * math.exp(-0.04354 * win_loss) - 3.1669
    return max(0.0, min(100.0, accuracy))

def calculate_move_accuracy(win_loss: float) -> float:
    """Helper wrapper calling standard move_accuracy formula."""
    return move_accuracy(win_loss)

def get_game_phase(board: chess.Board, move_number: int) -> str:
    """
    Dynamically determines the game phase (Opening, Middlegame, Endgame)
    based on material remaining, piece counts, and move number.
    """
    queens = len(board.pieces(chess.QUEEN, chess.WHITE)) + len(board.pieces(chess.QUEEN, chess.BLACK))
    rooks = len(board.pieces(chess.ROOK, chess.WHITE)) + len(board.pieces(chess.ROOK, chess.BLACK))
    knights = len(board.pieces(chess.KNIGHT, chess.WHITE)) + len(board.pieces(chess.KNIGHT, chess.BLACK))
    bishops = len(board.pieces(chess.BISHOP, chess.WHITE)) + len(board.pieces(chess.BISHOP, chess.BLACK))
    pawns = len(board.pieces(chess.PAWN, chess.WHITE)) + len(board.pieces(chess.PAWN, chess.BLACK))
    
    minor_pieces = knights + bishops
    major_pieces = queens + rooks
    total_non_pawn_pieces = minor_pieces + major_pieces
    
    # Early Queenless Endgames
    if queens == 0 and total_non_pawn_pieces <= 4:
        return "Endgame"
    
    # Pure Pawn Endgames
    if total_non_pawn_pieces == 0:
        return "Endgame"
        
    # Endgame standard (very simplified)
    if total_non_pawn_pieces <= 3:
        return "Endgame"
        
    # Opening standard
    if move_number <= 12 and total_non_pawn_pieces >= 12:
        return "Opening"
        
    # Middlegame
    return "Middlegame"

def detect_sacrifice(
    board_before: chess.Board,
    move_played: chess.Move,
    pv_after: Optional[List[str]],
    loss: float
) -> Optional[Dict[str, Any]]:
    """
    Analyzes material balance transitions in the PV line to detect sound sacrifices
    (Pawn, Exchange, Piece, or Queen) with positional compensation.
    """
    if not pv_after or len(pv_after) < 1:
        return None
        
    color = board_before.turn
    mat_before = get_material_value(board_before)
    bal_before = mat_before[color] - mat_before[not color]
    
    # Identify sacrificed piece name
    piece_type_enum = board_before.piece_type_at(move_played.from_square)
    piece_name = "Piece"
    if piece_type_enum == chess.PAWN:
        piece_name = "Pawn"
    elif piece_type_enum == chess.KNIGHT:
        piece_name = "Knight"
    elif piece_type_enum == chess.BISHOP:
        piece_name = "Bishop"
    elif piece_type_enum == chess.ROOK:
        piece_name = "Rook"
    elif piece_type_enum == chess.QUEEN:
        piece_name = "Queen"

    # Play the move
    board_temp = board_before.copy()
    try:
        board_temp.push(move_played)
    except Exception:
        return None
        
    # Record material balances along the PV line
    min_bal_diff = 0
    final_bal_diff = 0
    
    for uci in pv_after[:4]:
        try:
            board_temp.push(chess.Move.from_uci(uci))
            mat_curr = get_material_value(board_temp)
            bal_curr = mat_curr[color] - mat_curr[not color]
            bal_diff = bal_curr - bal_before
            
            if bal_diff < min_bal_diff:
                min_bal_diff = bal_diff
            final_bal_diff = bal_diff
        except Exception:
            break
            
    # If the player went down in material at any point in the PV line
    if min_bal_diff <= -100:
        # If the move was objectively sound (win probability loss <= brilliant_loss_limit)
        if loss <= ClassificationConfig.brilliant_loss_limit:
            sac_type = "Pawn"
            if min_bal_diff <= -900:
                sac_type = "Queen"
            elif min_bal_diff <= -500:
                sac_type = "Rook"
            elif min_bal_diff <= -300:
                sac_type = "Piece"
            elif min_bal_diff <= -200:
                sac_type = "Exchange"
                
            return {
                "type": sac_type,
                "value": abs(min_bal_diff),
                "temporary": final_bal_diff >= 0,
                "compensation": True,
                "piece_type": piece_name,
                "final_bal_diff": final_bal_diff
            }
    return None

def is_piece_threatened(board: chess.Board, square: chess.Square) -> bool:
    """
    Determines if a piece on a square is under active attack by the opponent
    with higher attacker count or threatened by a pawn/lower-value piece.
    """
    opponent = not board.turn
    attackers = board.attackers(opponent, square)
    if not attackers:
        return False
    
    defenders = board.attackers(board.turn, square)
    if not defenders:
        return True
        
    piece_type = board.piece_type_at(square)
    if piece_type is None:
        return False
        
    for attacker_sq in attackers:
        attacker_piece = board.piece_type_at(attacker_sq)
        if attacker_piece is None:
            continue
        if attacker_piece == chess.PAWN and piece_type != chess.PAWN:
            return True
        if attacker_piece < piece_type: # e.g. minor piece attacking queen/rook
            return True
            
    return False

def format_cp_to_score_str(cp: Optional[int]) -> str:
    if cp is None:
        return "N/A"
    if abs(cp) >= 9000:
        return f"M{1 if cp > 0 else -1}"
    return f"{cp/100:+.2f}"

def compute_brilliant_score(
    board_before: chess.Board,
    move_played: chess.Move,
    played_move_cp: int,
    best_move_cp: int,
    second_best_move_cp: Optional[int],
    win_before: float,
    win_after: float,
    loss: float,
    is_best_move: bool,
    is_alternative_best: bool,
    is_book_move: bool,
    is_forced: bool,
    sac_info: Optional[Dict[str, Any]],
    tactics: Dict[str, Any],
    phase: str,
    played_move_score_str: Optional[str],
    pv_after: Optional[List[str]] = None
) -> tuple[int, Dict[str, Any], List[str], List[str]]:
    rules_satisfied = []
    rules_failed = []

    # 1. Base disqualifications (Score = 0 immediately)
    if not (is_best_move or is_alternative_best):
        rules_failed.append("Is not engine best or equivalent move")
        return 0, {}, rules_satisfied, rules_failed
    else:
        rules_satisfied.append("Is engine best or equivalent move")

    if not sac_info:
        rules_failed.append("No genuine sacrifice detected")
        return 0, {}, rules_satisfied, rules_failed
    else:
        rules_satisfied.append("Contains a genuine material sacrifice")

    if is_book_move:
        rules_failed.append("Is a theoretical book move")
        return 0, {}, rules_satisfied, rules_failed
        
    if is_forced:
        rules_failed.append("Is a forced move (only legal continuation)")
        return 0, {}, rules_satisfied, rules_failed

    # 2. Baseline checks (Cap score at 49 if failed)
    baseline_failed = False
    
    # Baseline: Sacrifice is correct (CPL <= 10 or win prob loss <= 1.0)
    color = board_before.turn
    if color == chess.WHITE:
        cpl = max(0, best_move_cp - played_move_cp)
    else:
        cpl = max(0, played_move_cp - best_move_cp)
        
    if cpl <= 10 or loss <= 1.0:
        rules_satisfied.append("Sacrifice is objectively correct (CPL <= 10)")
    else:
        rules_failed.append("Sacrifice is incorrect (CPL > 10)")
        baseline_failed = True

    # Baseline: Not already completely winning before the move (win_before < 90%)
    if win_before < 90.0:
        rules_satisfied.append("Position was not already winning (<90%)")
    else:
        rules_failed.append("Position was already overwhelmingly winning (>=90%)")
        baseline_failed = True

    # Baseline: Uniqueness (second best move must be significantly worse, e.g. win_diff >= 5.0)
    win_diff = 15.0 # default if no second best move
    if second_best_move_cp is not None:
        win_second = score_to_win_percent(second_best_move_cp, color, None, turn_color=color)
        win_diff = win_before - win_second
        
    if win_diff >= 5.0:
        rules_satisfied.append("Sacrifice is unique among alternatives (win diff >= 5.0)")
    else:
        rules_failed.append("Sacrifice is not unique (multiple equivalent alternatives)")
        baseline_failed = True

    # Baseline: Significant objective benefit
    benefit_found = False
    benefit_reasons = []
    
    # benefit 1: forcing checkmate or mating sequence
    if played_move_score_str and ("M" in str(played_move_score_str)) and not str(played_move_score_str).startswith("-M"):
        benefit_reasons.append("Initiates a forced mating sequence")
        benefit_found = True
        
    # benefit 2: final material balance gains
    final_bal_diff = sac_info.get("final_bal_diff", 0)
    if final_bal_diff > 0:
        benefit_reasons.append(f"Wins substantial material (+{final_bal_diff}) after combination")
        benefit_found = True

    # benefit 3: decisive strategic advantage
    if win_after >= 80.0:
        benefit_reasons.append(f"Obtains a decisive strategic advantage (win prob {win_after:.1f}%)")
        benefit_found = True

    # benefit 4: converting equal to clearly winning
    if win_before <= 60.0 and win_after >= 75.0:
        benefit_reasons.append("Converts an equal position into a clearly winning one")
        benefit_found = True

    if benefit_found:
        rules_satisfied.append(f"Sacrifice yields significant benefit: {', '.join(benefit_reasons)}")
    else:
        rules_failed.append("Sacrifice does not produce a significant objective benefit")
        baseline_failed = True

    # If any baseline checks failed, cap the score at 49
    if baseline_failed:
        return 49, {}, rules_satisfied, rules_failed

    # 3. Calculate components if all baselines passed
    base_score = 60
    
    # A. Uniqueness score: max 15 points
    uniqueness_points = 0
    if win_diff >= 12.0:
        uniqueness_points = 15
    elif win_diff >= 8.0:
        uniqueness_points = 10
    elif win_diff >= 5.0:
        uniqueness_points = 5

    # B. Sacrificed Piece Value: max 10 points
    sac_val = sac_info.get("value", 0)
    sac_value_points = 0
    if sac_val >= 900:
        sac_value_points = 10
    elif sac_val >= 500:
        sac_value_points = 8
    elif sac_val >= 300:
        sac_value_points = 6
    elif sac_val >= 200:
        sac_value_points = 4
    elif sac_val >= 100:
        sac_value_points = 2

    # C. Game Phase complexity: max 5 points
    phase_points = 0
    if phase == "Middlegame":
        phase_points = 5
    elif phase == "Endgame":
        phase_points = 3
    elif phase == "Opening":
        phase_points = 1

    # D. Tactical Motifs: max 10 points
    tactical_points = 0
    if tactics.get("is_checkmate"):
        tactical_points = 10
    else:
        if tactics.get("is_check"):
            tactical_points += 5
        if tactics.get("is_promotion"):
            tactical_points += 5
        tactical_points = min(10, tactical_points)

    total_score = base_score + uniqueness_points + sac_value_points + phase_points + tactical_points
    total_score = min(100, max(50, total_score))

    explanation = {
        "sacrificed_piece": sac_info.get("piece_type", "Piece"),
        "material_invested": sac_info.get("value", 0),
        "material_ultimately_gained": max(0, final_bal_diff),
        "eval_before": format_cp_to_score_str(best_move_cp),
        "eval_after": format_cp_to_score_str(played_move_cp),
        "best_engine_line": " ".join(pv_after[:4]) if pv_after else "",
        "resulting_tactical_or_strategic_advantage": ", ".join(benefit_reasons) if benefit_reasons else "None",
        "uniqueness_score": uniqueness_points,
        "rules_satisfied": rules_satisfied
    }

    return total_score, explanation, rules_satisfied, rules_failed

def classify_move(
    board_before: chess.Board,
    move_played: chess.Move,
    played_move_cp: int,
    best_move_cp: int,
    second_best_move_cp: Optional[int],
    third_best_move_cp: Optional[int],
    is_book_move: bool,
    pv_after: Optional[List[str]] = None,
    played_move_score_str: Optional[str] = None,
    best_move_score_str: Optional[str] = None,
    best_move_uci: Optional[str] = None,
    move_number: int = 1,
    depth: int = 12,
    prev_move_classification: Optional[str] = None
) -> tuple[str, List[str], Dict[str, Any]]:
    """
    Classifies a move based on win probability loss, sacrifices, only-moves,
    forced outcomes, and game phase context. Returns (classification, reasons, diagnostics).
    """
    reasons = []
    classification = None

    color = board_before.turn

    # Win probability of best move vs played move
    win_before = score_to_win_percent(best_move_cp, color, best_move_score_str, turn_color=color)
    win_after = score_to_win_percent(played_move_cp, color, played_move_score_str, turn_color=not color)
    loss = win_percent_loss(win_before, win_after)

    # Calculate CPL relative to active player perspective
    if color == chess.WHITE:
        cpl = max(0, best_move_cp - played_move_cp)
    else:
        cpl = max(0, played_move_cp - best_move_cp)

    # Convert centipawns to active player perspective for simple threshold checks
    best_cp_player = best_move_cp if color == chess.WHITE else -best_move_cp
    played_cp_player = played_move_cp if color == chess.WHITE else -played_move_cp
    second_cp_player = (second_best_move_cp if color == chess.WHITE else -second_best_move_cp) if second_best_move_cp is not None else -10000

    # 1. Best move match
    is_best_move = False
    if best_move_uci:
        is_best_move = (move_played.uci() == best_move_uci)
    else:
        is_best_move = (loss <= 0.001)

    # Check if equivalent alternative (MultiPV)
    is_alternative_best = False
    if not is_best_move:
        if second_best_move_cp is not None:
            win_second = score_to_win_percent(second_best_move_cp, color, None, turn_color=color)
            if abs(win_before - win_second) < 1.0 and loss < 1.0:
                is_alternative_best = True

    # Forced move checks
    legal_moves_count = board_before.legal_moves.count()
    is_forced = (legal_moves_count == 1)
    
    # Recapture check
    is_recapture = False
    if board_before.is_capture(move_played) and len(board_before.move_stack) > 0:
        is_recapture = (board_before.peek().to_square == move_played.to_square)

    # Capture, Check, Mate tactics detection
    board_temp = board_before.copy()
    is_checkmate_delivered = False
    is_stalemate_delivered = False
    try:
        board_temp.push(move_played)
        is_checkmate_delivered = board_temp.is_checkmate()
        is_stalemate_delivered = board_temp.is_stalemate()
    except:
        pass

    # Sacrifice detection
    sac_info = detect_sacrifice(board_before, move_played, pv_after, loss)

    # If the sacrificed piece was already en prise / threatened, exclude it
    if sac_info and is_piece_threatened(board_before, move_played.from_square):
        sac_info = None

    tactics_dict = {
        "is_check": board_before.gives_check(move_played),
        "is_capture": board_before.is_capture(move_played),
        "is_promotion": move_played.promotion is not None,
        "is_checkmate": is_checkmate_delivered,
        "is_stalemate": is_stalemate_delivered,
        "sacrifice": sac_info
    }

    # Game phase
    phase = get_game_phase(board_before, move_number)

    # Brilliant calculation
    is_brilliant = False
    if sac_info is not None:
        if not is_piece_threatened(board_before, move_played.from_square):
            if is_best_move or loss <= ClassificationConfig.brilliant_loss_limit:
                if played_cp_player >= -150 and win_after >= ClassificationConfig.brilliant_min_win_after:
                    is_mate_before = (best_move_score_str is not None and "M" in str(best_move_score_str) and not str(best_move_score_str).startswith("-"))
                    if best_cp_player < 500 and win_before < ClassificationConfig.brilliant_max_win_before and not is_mate_before:
                        is_forced_def = False
                        if is_forced:
                            is_forced_def = True
                        elif second_best_move_cp is not None:
                            if second_cp_player <= -500:
                                is_forced_def = True
                        else:
                            if board_before.legal_moves.count() <= 1:
                                is_forced_def = True
                        
                        if not is_forced_def and not is_recapture:
                            is_brilliant = True

    # ────────────────────────────────────────────────────────────────────────
    # DECISION HIERARCHY
    # ────────────────────────────────────────────────────────────────────────
    
    # 0. Checkmate Delivered Short-circuit
    if is_checkmate_delivered:
        if classification is None:
            if is_brilliant:
                classification = "Brilliant"
                reasons.append(f"Brilliant {sac_info['piece_type']} sacrifice delivering checkmate")
            else:
                classification = "Best"
                reasons.append("Delivered checkmate")

    # 1. Book Moves
    # We no longer short-circuit classification to "Book" here so that book moves
    # are evaluated and classified normally by the engine.

    # 2. Brilliant Check
    if classification is None:
        if is_brilliant:
            classification = "Brilliant"
            reasons.append(f"Brilliant {sac_info['piece_type']} sacrifice with decisive positional compensation")

    # 3. Great Check (non-sacrifice only-moves, defensive saves, escapes)
    if classification is None:
        if (is_best_move or loss < ClassificationConfig.great_near_best_threshold) and not is_forced:
            is_great = False
            if second_best_move_cp is not None:
                win_second = score_to_win_percent(second_best_move_cp, color, None, turn_color=color)
                loss_second = win_before - win_second
                
                # Only-move preserving evaluation
                if loss_second >= ClassificationConfig.great_only_move_win_diff and win_before < 85.0:
                    classification = "Great"
                    reasons.append("Only move that maintains the evaluation")
                    is_great = True
                # Escaping checkmate / forced loss
                elif second_cp_player <= -500 and played_cp_player > -150:
                    classification = "Great"
                    reasons.append("Found the only line escaping decisive loss or checkmate")
                    is_great = True

            # Lost position comeback
            if not is_great and win_before <= ClassificationConfig.great_escape_max_win_before and win_after >= ClassificationConfig.great_comeback_min_win_after:
                classification = "Great"
                reasons.append("Found a defensive resource keeping the game alive")

    # 4. Miss Check (Overlooked capitalization of opponent's mistake/blunder)
    if classification is None:
        if prev_move_classification in ["Mistake", "Blunder"] and loss >= ClassificationConfig.miss_min_win_loss:
            classification = "Miss"
            reasons.append("Missed a winning tactical continuation or material gain")

    # 5. Standard move classifications based on win probability loss tiers
    if classification is None:
        # Blunder: loss >= 20%
        if loss >= 20.0:
            classification = "Blunder"
            if win_before >= 60.0 and win_after < 40.0:
                reasons.append("Threw away a significant winning advantage")
            else:
                reasons.append("Critical blunder altering the outcome of the game")
        elif played_move_score_str and "M" in str(played_move_score_str) and str(played_move_score_str).startswith("-M") and not (best_move_score_str and "M" in str(best_move_score_str) and str(best_move_score_str).startswith("-M")):
            classification = "Blunder"
            reasons.append("Allowed a forced checkmate sequence")

        # Mistake: 10% <= loss < 20%
        elif loss >= 10.0:
            classification = "Mistake"
            reasons.append("Mistake that compromises the position")

        # Inaccuracy: 5% <= loss < 10%
        elif loss >= 5.0:
            classification = "Inaccuracy"
            reasons.append("Inaccuracy that slightly reduces winning chances")

        # Good: 2% <= loss < 5%
        elif loss >= 2.0:
            classification = "Good"
            reasons.append("Good practical move keeping the position playable")

        # Now, if it's the engine's top choice:
        elif is_best_move:
            classification = "Best"
            reasons.append("This is the engine's top move.")

        # If not the engine's top choice, but loss is within the Best tolerance (loss < 1.0) or is_alternative_best:
        elif loss < 1.0 or is_alternative_best:
            classification = "Excellent"
            reasons.append("An equally strong alternative to the engine's preferred line.")

        # Otherwise (loss is between 1.0 and 2.0):
        else:
            classification = "Excellent"
            reasons.append("Near-perfect move maintaining the evaluation")

    # Construct the final structured diagnostics object
    diagnostics = {
        "move_number": move_number,
        "san": board_before.san(move_played),
        "uci": move_played.uci(),
        "player": "White" if color == chess.WHITE else "Black",
        "game_phase": phase,
        "opening_state": "Book" if is_book_move else "Out of Book",
        "depth": depth,
        "eval_before": best_move_score_str or format_cp_to_score_str(best_move_cp),
        "eval_after": played_move_score_str or format_cp_to_score_str(played_move_cp),
        "best_line_eval": best_move_score_str or format_cp_to_score_str(best_move_cp),
        "played_line_eval": played_move_score_str or format_cp_to_score_str(played_move_cp),
        "cpl": cpl,
        "mate_before": best_move_score_str if (best_move_score_str and "M" in str(best_move_score_str)) else "N/A",
        "mate_after": played_move_score_str if (played_move_score_str and "M" in str(played_move_score_str)) else "N/A",
        "win_before": round(win_before / 100.0, 3),
        "win_after": round(win_after / 100.0, 3),
        "win_prob_loss": round(loss / 100.0, 3),
        "is_forced": is_forced,
        "only_one_legal_move": is_forced,
        "is_best_move": is_best_move,
        "multipv": {
            "best": {"uci": best_move_uci, "score": best_move_score_str or format_cp_to_score_str(best_move_cp), "cp": best_move_cp},
            "second": {"score": format_cp_to_score_str(second_best_move_cp), "cp": second_best_move_cp} if second_best_move_cp is not None else None,
            "third": {"score": format_cp_to_score_str(third_best_move_cp), "cp": third_best_move_cp} if third_best_move_cp is not None else None
        },
        "fen": board_before.fen(),
        "tactics": tactics_dict,
        "classification": classification,
        "reasons": reasons
    }

    return classification, reasons, diagnostics


