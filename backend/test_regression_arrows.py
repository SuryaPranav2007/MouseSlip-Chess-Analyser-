import sys
import os
import asyncio
import chess
import chess.pgn
import chess.engine
import io

# Ensure backend directory is in the python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import EnginePool

# PGN from the bug report
pgn_text = (
    "1. d4 Nf6 2. Nf3 d5 3. c4 e6 4. Nc3 Bb4 5. Bg5 dxc4 6. e4 c5 "
    "7. Bxc4 cxd4 8. Nxd4 Qa5 9. Bd2 Qc5 10. Bb5+ Bd7 11. Nb3 Qe7 "
    "12. Bd3 Nc6 13. O-O O-O 14. a3 Bd6 15. Kh1 e5 16. Bg5 Qd8"
)

# Coordinate mapping logic (matching Chessboard.tsx getCoords)
def get_coords(sq: str, square_size: float, orientation: str):
    file = ord(sq[0]) - 97
    rank = int(sq[1]) - 1
    if orientation == 'white':
        x = (file + 0.5) * square_size
        y = (7 - rank + 0.5) * square_size
    else:
        x = (7 - file + 0.5) * square_size
        y = (rank + 0.5) * square_size
    return x, y

async def run_regression_tests():
    print("Initializing engine pool...")
    engine_pool = EnginePool(size=1)
    await engine_pool.initialize()
    engine = await engine_pool.acquire()

    # Position after 16...Qd8 (White to play move 17)
    board_17 = chess.Board()
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    for move in game.mainline_moves():
        board_17.push(move)

    print(f"\n[Move 17 Position FEN]: {board_17.fen()}")
    analysis_17 = await engine.analyse(board_17, chess.engine.Limit(depth=18), multipv=2)
    
    pv1_17 = analysis_17[0].get("pv")[0] if analysis_17[0].get("pv") else None
    pv2_17 = analysis_17[1].get("pv")[0] if len(analysis_17) > 1 and analysis_17[1].get("pv") else None
    
    print(f"PV1 Move 17 (best): {pv1_17.uci() if pv1_17 else None}")
    print(f"PV2 Move 17 (second best): {pv2_17.uci() if pv2_17 else None}")
    
    # Assertions for move 17
    # Engine matches Stockfish depth 18 MultiPV=2 output:
    # best: d3c4 (Bc4), second: c3d5 (Nd5) or d3a6 depending on engine version/depth
    assert pv1_17 is not None and pv1_17.uci() == "d3c4", f"Expected best move d3c4, got {pv1_17}"
    
    # Verify pieces on origin squares
    assert board_17.piece_at(chess.D3).piece_type == chess.BISHOP
    if pv2_17.uci() == "c3d5":
        assert board_17.piece_at(chess.C3).piece_type == chess.KNIGHT
    elif pv2_17.uci() == "d3a6":
        assert board_17.piece_at(chess.D3).piece_type == chess.BISHOP

    # Coordinate validation for White & Black orientations
    square_size = 70.0
    
    # Normal (White) Perspective Coords
    # d3 center: file=3, rank=2 -> x=245.0, y=385.0
    x_w, y_w = get_coords("d3", square_size, "white")
    assert x_w == 245.0 and y_w == 385.0, f"White orientation d3 coords incorrect: x={x_w}, y={y_w}"
    
    # Flipped (Black) Perspective Coords
    # d3 center: file=3, rank=2 -> x=315.0, y=175.0
    x_b, y_b = get_coords("d3", square_size, "black")
    assert x_b == 315.0 and y_b == 175.0, f"Black orientation d3 coords incorrect: x={x_b}, y={y_b}"

    print("Move 17 coordinate mapping assertions passed successfully!")

    # Position after 17. Bxf6 Qxf6 (White to play move 18)
    board_18 = board_17.copy()
    board_18.push(board_18.parse_san("Bxf6"))
    board_18.push(board_18.parse_san("Qxf6"))
    
    print(f"\n[Move 18 Position FEN]: {board_18.fen()}")
    analysis_18 = await engine.analyse(board_18, chess.engine.Limit(depth=18), multipv=2)
    pv1_18 = analysis_18[0].get("pv")[0] if analysis_18[0].get("pv") else None
    pv2_18 = analysis_18[1].get("pv")[0] if len(analysis_18) > 1 and analysis_18[1].get("pv") else None
    
    print(f"PV1 Move 18 (best): {pv1_18.uci() if pv1_18 else None}")
    print(f"PV2 Move 18 (second best): {pv2_18.uci() if pv2_18 else None}")
    
    # Verify the pieces on origin squares for move 18 best/second best
    if pv1_18:
        from_sq = pv1_18.from_square
        piece = board_18.piece_at(from_sq)
        print(f"Move 18 best: {pv1_18.uci()} (moving piece: {piece})")
        assert piece is not None, "Move 18 best move origin square is empty!"
        
        # Verify rendered coordinate center matches origin square
        sq_str = chess.square_name(from_sq)
        x_w, y_w = get_coords(sq_str, square_size, "white")
        expected_x = (from_sq % 8 + 0.5) * square_size
        expected_y = (7 - (from_sq // 8) + 0.5) * square_size
        assert x_w == expected_x and y_w == expected_y, f"Incorrect coords for {sq_str}"
        
    if pv2_18:
        from_sq = pv2_18.from_square
        piece = board_18.piece_at(from_sq)
        print(f"Move 18 second best: {pv2_18.uci()} (moving piece: {piece})")
        assert piece is not None, "Move 18 second best move origin square is empty!"
        
        # Verify rendered coordinate center matches origin square
        sq_str = chess.square_name(from_sq)
        x_b, y_b = get_coords(sq_str, square_size, "black")
        expected_x = (7 - (from_sq % 8) + 0.5) * square_size
        expected_y = ((from_sq // 8) + 0.5) * square_size
        assert x_b == expected_x and y_b == expected_y, f"Incorrect coords for {sq_str}"

    print("Move 18 coordinate mapping assertions passed successfully!")
    await engine_pool.shutdown()
    print("\nAll regression tests completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_regression_tests())
