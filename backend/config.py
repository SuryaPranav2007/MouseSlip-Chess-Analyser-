class ClassificationConfig:
    # Win Probability calibration constant
    # win_prob = 1.0 / (1.0 + 10.0 ** (-cp / win_prob_denominator))
    # Standard Elo denominator is 400. Matches Lichess exactly.
    win_prob_denominator: float = 400.0
    
    # Accuracy Exponential curve parameters:
    # accuracy = 100.0 * exp(-accuracy_k * win_prob_loss)
    # where win_prob_loss is (win_before - win_after) in percentage (0 to 100).
    accuracy_k: float = 0.046
    
    # Win-probability loss thresholds (0 to 100)
    # Boundaries are explicit and non-overlapping:
    #   Best:        loss < 1.0
    #   Excellent:   1.0 <= loss < 3.5
    #   Good:        3.5 <= loss < 7.0
    #   Inaccuracy:  7.0 <= loss < 10.0
    #   Mistake:     10.0 <= loss < 20.0
    #   Blunder:     loss >= 20.0
    best_loss_threshold: float = 0.0
    excellent_loss_threshold: float = 0.0001
    good_loss_threshold: float = 2.0
    inaccuracy_loss_threshold: float = 5.0
    mistake_loss_threshold: float = 10.0
    blunder_loss_threshold: float = 20.0
    
    # Centipawn loss fallback thresholds (used as secondary classification signal)
    excellent_cp_loss: int = 10                 # <10cp
    good_cp_loss: int = 25                      # <25cp
    inaccuracy_cp_loss: int = 50                # <50cp
    mistake_cp_loss: int = 100                  # <100cp
    
    # Great Move configuration
    great_near_best_threshold: float = 1.0      # Played move must lose < 1.0% win probability
    great_only_move_win_diff: float = 5.0       # Second best move loses >= 5% vs best
    great_comeback_min_win_after: float = 40.0  # Must recover to >= 40% win prob
    great_escape_max_win_before: float = 15.0   # Must escape from <= 15% win prob
    
    # Brilliant Move configuration
    brilliant_min_depth: int = 12               # Minimum engine depth to confirm
    brilliant_max_win_before: float = 85.0      # Not already decisively winning (<85.0% win prob)
    brilliant_min_win_after: float = 35.0       # Position must remain playable
    brilliant_loss_limit: float = 2.0           # Played move must be near-best (<2% loss)
    
    # Miss Move configuration
    miss_min_win_loss: float = 10.0             # Failing to capitalize must lose >= 10.0% win prob
