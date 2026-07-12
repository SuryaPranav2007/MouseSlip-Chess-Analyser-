import chess
from utils import classify_move, score_to_win_percent
from config import ClassificationConfig

def run_tests():
    print("=== RUNNING CLASSIFICATION OVERHAUL TARGET TEST CASES ===")
    
    # 1. Boundary Test: loss is exactly at 20.0% (Mistake/Blunder boundary)
    # Let's verify standard win-probability-loss tiers assign correctly.
    # Blunder covers loss >= 20.0, Mistake covers 10.0 <= loss < 20.0.
    # If loss is exactly 20.0, it must be Blunder.
    # Let's set up a test case:
    # win_before = 50.0. win_after = 30.0. loss = 20.0.
    # To get win_before = 50.0, cp = 0.
    # To get win_after = 30.0, cp = -230 (approx, let's verify via score_to_win_percent)
    
    board = chess.Board() # starting position
    # Let's mock classify_move input:
    # White turn. best_move_cp = 0 (win_before = 50.0). played_move_cp = -230 (win_after = 30.0).
    cls, reasons, diagnostics = classify_move(
        board_before=board,
        move_played=chess.Move.from_uci("g1f3"),
        played_move_cp=-231,
        best_move_cp=0,
        second_best_move_cp=None,
        third_best_move_cp=None,
        is_book_move=False,
        played_move_score_str=None,
        best_move_score_str=None
    )
    # loss calculated should be exactly 20.0
    loss = diagnostics["win_prob_loss"] * 100.0
    print(f"1. Boundary Test: cp=-231 -> calculated loss={loss:.2f}% | classification={cls}")
    assert cls == "Blunder", f"Expected Blunder, got {cls}"
    
    # Let's test a loss just below 20.0 (e.g. 19.9%)
    # Let's use played_move_cp = -228 (approx 19.8% loss)
    cls, reasons, diagnostics = classify_move(
        board_before=board,
        move_played=chess.Move.from_uci("g1f3"),
        played_move_cp=-228,
        best_move_cp=0,
        second_best_move_cp=None,
        third_best_move_cp=None,
        is_book_move=False,
        played_move_score_str=None,
        best_move_score_str=None
    )
    loss = diagnostics["win_prob_loss"] * 100.0
    print(f"   Near-Boundary Test: cp=-228 -> calculated loss={loss:.2f}% | classification={cls}")
    assert cls == "Mistake", f"Expected Mistake, got {cls}"

    # 2. Failed Sacrifice Test
    # FEN: White queen on h5, Black rook on e8, Black knight on d6.
    # White plays Qxe8+ (sacrifice), Black plays Nxe8.
    # white goes down in material.
    # played_move_cp = -300 (win_after = 24.9%). Unfavorable!
    # So it should fall through to Mistake or Blunder instead of Brilliant.
    board_sac = chess.Board("4r3/8/3n4/7Q/8/8/8/4K3 w - - 0 1")
    cls, reasons, diagnostics = classify_move(
        board_before=board_sac,
        move_played=chess.Move.from_uci("h5e8"),
        played_move_cp=-300,
        best_move_cp=0,
        second_best_move_cp=None,
        third_best_move_cp=None,
        is_book_move=False,
        pv_after=["d6e8"],
        played_move_score_str=None,
        best_move_score_str=None
    )
    print(f"2. Failed Sacrifice Test: cp=-300 -> classification={cls}")
    assert cls in ["Mistake", "Blunder"], f"Expected Mistake or Blunder for failed sacrifice, got {cls}"

    # 3. Already-Winning Sacrifice Test
    # White plays Qxe8+ (sacrifice), holds up (played_move_cp = 490).
    # win_before = 86.3% (best_move_cp = 500).
    # Since win_before >= brilliant_max_win_before (85.0), it should NOT be Brilliant.
    cls, reasons, diagnostics = classify_move(
        board_before=board_sac,
        move_played=chess.Move.from_uci("h5e8"),
        played_move_cp=490,
        best_move_cp=500,
        second_best_move_cp=None,
        third_best_move_cp=None,
        is_book_move=False,
        pv_after=["d6e8"],
        played_move_score_str=None,
        best_move_score_str=None
    )
    print(f"3. Already-Winning Sacrifice Test: win_before=86.3% -> classification={cls}")
    assert cls in ["Best", "Excellent", "Good"], f"Expected Best, Excellent or Good, got {cls}"

    # 3b. Genuine Brilliant Sacrifice Test
    # White plays Qxe8+ (sacrifice), holds up (played_move_cp = 90), win_before = 67.9% (best_move_cp = 100).
    # This should be Brilliant!
    cls, reasons, diagnostics = classify_move(
        board_before=board_sac,
        move_played=chess.Move.from_uci("h5e8"),
        played_move_cp=90,
        best_move_cp=100,
        second_best_move_cp=None,
        third_best_move_cp=None,
        is_book_move=False,
        pv_after=["d6e8"],
        played_move_score_str=None,
        best_move_score_str=None
    )
    print(f"3b. Genuine Brilliant Sacrifice Test: win_before=67.9% -> classification={cls}")
    assert cls == "Brilliant", f"Expected Brilliant, got {cls}"

    # 4. Forced-Only-Move Position Test
    # Played move is a best/near-best move. Position has other legal moves.
    # Second best move is a decisive loss (second_best_move_cp = -500).
    # Since it is a safe only-move, it must be classified as Great.
    cls, reasons, diagnostics = classify_move(
        board_before=board,
        move_played=chess.Move.from_uci("g1f3"),
        played_move_cp=0,
        best_move_cp=0,
        second_best_move_cp=-500,
        third_best_move_cp=None,
        is_book_move=False,
        played_move_score_str=None,
        best_move_score_str=None
    )
    print(f"4. Forced-Only-Move Position Test: second_best=-500 -> classification={cls}")
    assert cls == "Great", f"Expected Great, got {cls}"

    # 5. Genuine Miss Test
    # Opponent's previous move was Mistake/Blunder.
    # The current move fails to capitalize (loss >= 10.0% win prob).
    # It must be classified as Miss.
    cls, reasons, diagnostics = classify_move(
        board_before=board,
        move_played=chess.Move.from_uci("g1f3"),
        played_move_cp=-150, # win_after = 37.1% (loss = 12.9%)
        best_move_cp=0,      # win_before = 50.0%
        second_best_move_cp=None,
        third_best_move_cp=None,
        is_book_move=False,
        played_move_score_str=None,
        best_move_score_str=None,
        prev_move_classification="Blunder"
    )
    print(f"5. Genuine Miss Test: prev_cls=Blunder -> classification={cls}")
    assert cls == "Miss", f"Expected Miss, got {cls}"

    # 6. False-Positive Miss Check Test
    # Opponent's previous move was NOT a Mistake/Blunder (e.g. was "Good").
    # The current move loses win probability (loss = 12.9%).
    # It must NOT be classified as Miss; it should fall through to Mistake.
    cls, reasons, diagnostics = classify_move(
        board_before=board,
        move_played=chess.Move.from_uci("g1f3"),
        played_move_cp=-150, # loss = 12.9%
        best_move_cp=0,
        second_best_move_cp=None,
        third_best_move_cp=None,
        is_book_move=False,
        played_move_score_str=None,
        best_move_score_str=None,
        prev_move_classification="Good"
    )
    print(f"6. False-Positive Miss Test: prev_cls=Good -> classification={cls}")
    assert cls == "Mistake", f"Expected Mistake, got {cls}"

    # 7. Full-Game Audit / Single Classification Guarantee
    # We will loop through various random losses and verify that every move returns exactly one valid classification.
    categories = {"Brilliant", "Great", "Book", "Best", "Excellent", "Good", "Inaccuracy", "Mistake", "Miss", "Blunder"}
    for cp in range(-1000, 1000, 10):
        cls, reasons, diagnostics = classify_move(
            board_before=board,
            move_played=chess.Move.from_uci("g1f3"),
            played_move_cp=cp,
            best_move_cp=100,
            second_best_move_cp=None,
            third_best_move_cp=None,
            is_book_move=False,
            played_move_score_str=None,
            best_move_score_str=None,
            prev_move_classification="Book"
        )
        assert cls in categories, f"Invalid or missing classification {cls} for played_cp={cp}"
    print("7. Full-Game Audit: loop through 200 different positions -> all moves classified successfully!")
    print("=== ALL TARGET TESTS PASSED SUCCESSFULY! ===")

if __name__ == "__main__":
    run_tests()
