import asyncio
import chess
import chess.pgn
import io
import sys
from openings import OpeningDetector
from engine import EnginePool
from utils import classify_move, calculate_move_accuracy, score_to_win_percent, win_percent_loss

# Define sample PGNs representing 6 tiers:
CORPUS = {
    "Beginner": "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#", # Fast mate, big blunder on move 3 Nf6 (which drops to mate-in-1)
    "Intermediate": "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 h6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#", # Légal's Mate (Black blunders Nd5, White plays well)
    "Club": "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6 5. Nc3 Bb4 6. Nxc6 bxc6 7. Bd3 d5 8. exd5 cxd5 9. O-O O-O 10. Bg5 c6", # Scotch game standard line
    "Expert": "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7", # Ruy Lopez, Breyer Defence
    "Master": "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. Bc4 Bd7 10. O-O-O Rc8 11. Bb3 Ne5 12. Kb1 Nc4 13. Bxc4 Rxc4 14. g4 b5", # Yugoslav Attack, Dragon
    "Grandmaster": "1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7" # Kasparov vs Topalov 1999 (legendary game)
}

async def analyze_game_review(pgn_str: str, detector: OpeningDetector, engine_pool: EnginePool):
    pgn = chess.pgn.read_game(io.StringIO(pgn_str))
    board = pgn.board()
    
    # Collect all positions in the game
    fens = [board.fen()]
    moves = []
    for move in pgn.mainline_moves():
        board.push(move)
        fens.append(board.fen())
        moves.append(move)
        
    evaluations = []
    
    # Analyze all positions in the game using the real EnginePool
    # To keep the test suite fast, we run analysis at depth=8
    for idx, fen in enumerate(fens):
        board_pos = chess.Board(fen)
        engine = await engine_pool.acquire()
        try:
            res_analysis = await engine.analyse(board_pos, chess.engine.Limit(depth=8), multipv=3)
            
            # Extract PV #1
            pv1 = res_analysis[0] if len(res_analysis) > 0 else {}
            score1 = pv1.get("score")
            cp_white1 = score1.white().score()
            if score1.is_mate():
                mate_val1 = score1.white().mate()
                cp1 = 10000 if mate_val1 >= 0 else -10000
                score_str1 = f"M{mate_val1}"
            else:
                cp1 = cp_white1 if cp_white1 is not None else 0
                score_str1 = f"+{cp1/100:.2f}" if cp1 >= 0 else f"{cp1/100:.2f}"
            pv1_moves = pv1.get("pv", [])
            best_move = pv1_moves[0].uci() if pv1_moves else None
            
            # Extract PV #2
            cp2 = None
            second_best_move = None
            if len(res_analysis) > 1:
                pv2 = res_analysis[1]
                score2 = pv2.get("score")
                cp_white2 = score2.white().score()
                if score2.is_mate():
                    mate_val2 = score2.white().mate()
                    cp2 = 10000 if mate_val2 >= 0 else -10000
                else:
                    cp2 = cp_white2 if cp_white2 is not None else 0
                pv2_moves = pv2.get("pv", [])
                second_best_move = pv2_moves[0].uci() if pv2_moves else None
                
            # Extract PV #3
            cp3 = None
            if len(res_analysis) > 2:
                pv3 = res_analysis[2]
                score3 = pv3.get("score")
                cp_white3 = score3.white().score()
                if score3.is_mate():
                    mate_val3 = score3.white().mate()
                    cp3 = 10000 if mate_val3 >= 0 else -10000
                else:
                    cp3 = cp_white3 if cp_white3 is not None else 0
                    
            evaluations.append({
                "score": score_str1,
                "cp": cp1,
                "best_move": best_move,
                "second_best_move": second_best_move,
                "second_best_cp": cp2,
                "third_best_cp": cp3,
                "pv": [m.uci() for m in pv1_moves]
            })
        finally:
            engine_pool.release(engine)
            
    # Run the classification loop
    board_run = chess.Board()
    white_accuracies = []
    black_accuracies = []
    white_cpl = []
    black_cpl = []
    
    classifications = {"white": {}, "black": {}}
    has_left_book = False
    
    for i, move in enumerate(moves):
        color = board_run.turn
        fen_before = board_run.fen()
        board_before = board_run.copy()
        board_run.push(move)
        
        eval_before = evaluations[i]
        eval_after = evaluations[i+1]
        
        # Opening database matching
        op_info = detector.get_opening(board_before)
        is_book = (op_info.get("status") == "Book") if op_info else False
        if has_left_book:
            is_book = False
        elif not is_book:
            has_left_book = True
            
        # Calculate CPL
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
        
        classification, reasons, diagnostics = classify_move(
            board_before=board_before,
            move_played=move,
            played_move_cp=eval_after["cp"],
            best_move_cp=eval_before["cp"],
            second_best_move_cp=eval_before.get("second_best_cp"),
            third_best_move_cp=eval_before.get("third_best_cp"),
            is_book_move=is_book,
            pv_after=None,
            played_move_score_str=eval_after.get("score"),
            best_move_score_str=eval_before.get("score"),
            best_move_uci=eval_before.get("best_move"),
            move_number=i + 1
        )
        
        legal_moves_count = board_before.legal_moves.count()
        is_forced = (legal_moves_count == 1)
        is_mate_move = (eval_before.get("score") and str(eval_before["score"]).startswith("M")) or \
                       (eval_after.get("score") and str(eval_after["score"]).startswith("M"))
                       
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
                    
        col_str = "white" if color == chess.WHITE else "black"
        classifications[col_str][classification] = classifications[col_str].get(classification, 0) + 1
        
    white_acc = sum(white_accuracies) / len(white_accuracies) if white_accuracies else 100.0
    black_acc = sum(black_accuracies) / len(black_accuracies) if black_accuracies else 100.0
    white_avg_cpl = sum(white_cpl) / len(white_cpl) if white_cpl else 0
    black_avg_cpl = sum(black_cpl) / len(black_cpl) if black_cpl else 0
    
    return {
        "white_accuracy": round(white_acc, 1),
        "black_accuracy": round(black_acc, 1),
        "white_cpl": round(white_avg_cpl, 1),
        "black_cpl": round(black_avg_cpl, 1),
        "classifications": classifications
    }

async def run_regression_suite():
    print("======================================================================")
    print("RUNNING PERMANENT REGRESSION TESTING CORPUS")
    print("======================================================================")
    
    detector = OpeningDetector()
    await detector.initialize()
    
    engine_pool = EnginePool(size=3)
    await engine_pool.initialize()
    
    results = {}
    for tier, pgn in CORPUS.items():
        res = await analyze_game_review(pgn, detector, engine_pool)
        results[tier] = res
        print(f"Tier: {tier:13} | White Acc: {res['white_accuracy']}% | Black Acc: {res['black_accuracy']}% | White CPL: {res['white_cpl']} | Black CPL: {res['black_cpl']}")
        
    print("\n----------------------------------------------------------------------")
    print("VERIFYING ACCURACY AND CLASSIFICATION CONSISTENCY")
    print("----------------------------------------------------------------------")
    
    # Assert GM has high accuracy (often > 80% at depth 8)
    gm_res = results["Grandmaster"]
    print(f"Grandmaster Accuracies -> White: {gm_res['white_accuracy']}%, Black: {gm_res['black_accuracy']}%")
    assert gm_res["white_accuracy"] > 80.0, "GM White accuracy should be high (>80% at depth 8)"
    assert gm_res["black_accuracy"] > 80.0, "GM Black accuracy should be high (>80% at depth 8)"
    
    # Assert Beginner has lower accuracy
    beg_res = results["Beginner"]
    print(f"Beginner Accuracies -> White: {beg_res['white_accuracy']}%, Black: {beg_res['black_accuracy']}%")
    assert beg_res["black_accuracy"] < 30.0, "Beginner Black accuracy should be lower (<30%) due to blundering mate-in-1"
    
    # Assert Intermediate has intermediate values
    int_res = results["Intermediate"]
    print(f"Intermediate Accuracies -> White: {int_res['white_accuracy']}%, Black: {int_res['black_accuracy']}%")
    assert int_res["black_accuracy"] < 80.0, "Intermediate Black accuracy should be low (<80%) due to blundering Légal's mate"
    
    print("\n[SUCCESS] Regression suite passed successfully!")
    print("======================================================================")

if __name__ == "__main__":
    asyncio.run(run_regression_suite())
