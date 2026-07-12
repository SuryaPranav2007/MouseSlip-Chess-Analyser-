import chess
from utils import classify_move
from config import ClassificationConfig

def test_brilliant_overhaul():
    print("=== RUNNING BRILLIANT MOVE OVERHAUL UNIT TESTS ===")
    
    # 1. Real material sac leading to forced mate (should be Brilliant)
    # White queen on h5, White rook on d1, Black king on h8, Black rook on f8.
    # Move: Qxh7+ (sacrifices queen, not checkmate immediately).
    board_1 = chess.Board("5r1k/6pp/8/7Q/8/8/8/3RK3 w - - 0 1")
    cls_1, reasons_1, diag_1 = classify_move(
        board_before=board_1,
        move_played=chess.Move.from_uci("h5h7"), # Qxh7+ (sac)
        played_move_cp=9999, # Mate sequence (win_after = 100.0%)
        best_move_cp=150,    # Normal position (win_before = 70.0% < 85%)
        second_best_move_cp=100, # Other moves are fine but not mating
        third_best_move_cp=None,
        is_book_move=False,
        pv_after=["g7h7", "d1d8"],
        played_move_score_str="M2",
        best_move_score_str=None
    )
    print(f"Case 1 (Mate Sac): classification={cls_1} | reasons={reasons_1}")
    assert cls_1 == "Brilliant", f"Expected Brilliant, got {cls_1}"
    
    # 2. Real material sac in an already-winning position that should NOT be tagged brilliant
    board_2 = chess.Board("5r1k/6pp/8/7Q/8/8/8/3RK3 w - - 0 1")
    cls_2, reasons_2, diag_2 = classify_move(
        board_before=board_2,
        move_played=chess.Move.from_uci("h5h7"), # Qxh7+
        played_move_cp=9999,
        best_move_cp=600,    # Already decisively winning (eval >= +5.00 / win_before >= 85%)
        second_best_move_cp=550,
        third_best_move_cp=None,
        is_book_move=False,
        pv_after=["g7h7", "d1d8"],
        played_move_score_str="M2",
        best_move_score_str="+6.00"
    )
    print(f"Case 2 (Overwhelmingly Winning Sac): classification={cls_2} | reasons={reasons_2}")
    assert cls_2 in ["Best", "Excellent"], f"Expected Best or Excellent, got {cls_2}"

    # 3. Forced-only-move sac that should NOT be tagged brilliant
    board_3 = chess.Board("5r1k/6pp/8/7Q/8/8/8/3RK3 w - - 0 1")
    cls_3, reasons_3, diag_3 = classify_move(
        board_before=board_3,
        move_played=chess.Move.from_uci("h5h7"), # Qxh7+
        played_move_cp=9999,
        best_move_cp=150,
        second_best_move_cp=-600, # All other moves lead to losing/mate (forced sequence)
        third_best_move_cp=None,
        is_book_move=False,
        pv_after=["g7h7", "d1d8"],
        played_move_score_str="M2",
        best_move_score_str=None
    )
    print(f"Case 3 (Forced-only-move Sac): classification={cls_3} | reasons={reasons_3}")
    assert cls_3 == "Great", f"Expected Great (saving only-move), got {cls_3}"
    
    print("=== ALL BRILLIANT OVERHAUL UNIT TESTS PASSED! ===")

if __name__ == "__main__":
    test_brilliant_overhaul()
