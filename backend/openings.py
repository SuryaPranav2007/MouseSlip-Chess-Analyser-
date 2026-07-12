import os
import json
import logging
import aiohttp
import chess
from typing import List, Dict, Any, Optional

logger = logging.getLogger("mouseslip.openings")

TSV_URLS = [
    f"https://raw.githubusercontent.com/lichess-org/chess-openings/master/{char}.tsv"
    for char in ["a", "b", "c", "d", "e"]
]

CACHE_FILE = os.path.join(os.path.dirname(__file__), "openings_cache.json")

# Fallback basic openings in case download fails or is offline
FALLBACK_OPENINGS = {
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR": {"eco": "B00", "name": "King's Pawn Game"},
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPPP1PPP/RNBQKBNR": {"eco": "A40", "name": "Queen's Pawn Game"},
    "r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR": {"eco": "B00", "name": "Nimzowitsch Defense"},
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR": {"eco": "C20", "name": "Open Game"},
    "rnbqkbnr/pp1ppppp/8/2p28/4P3/8/PPPP1PPP/RNBQKBNR": {"eco": "B20", "name": "Sicilian Defense"},
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R": {"eco": "C40", "name": "King's Knight Opening"},
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R": {"eco": "C44", "name": "King's Pawn Game: MacLeod Attack"},
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R": {"eco": "C50", "name": "Italian Game"},
    "r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R": {"eco": "C44", "name": "Scotch Game"},
    "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R": {"eco": "C60", "name": "Ruy Lopez"},
    "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R": {"eco": "C42", "name": "Petrov's Defense"},
    "rnbqkbnr/pppppppp/8/8/2P5/8/PPPP1PPP/RNBQKBNR": {"eco": "A10", "name": "English Opening"},
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR": {"eco": "D00", "name": "Queen's Gambit"},
}

class OpeningDetector:
    def __init__(self):
        self.openings_map = {"uci": {}, "epd": {}}
        self.loaded = False

    async def initialize(self):
        """Initializes the opening database by loading from cache or downloading."""
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "uci" in data and "epd" in data:
                    self.openings_map = data
                    self.loaded = True
                    logger.info(f"Loaded {len(self.openings_map['uci'])} openings from cache file.")
                    return
                else:
                    logger.info("Old cache format detected. Re-building openings cache...")
            except Exception as e:
                logger.error(f"Error loading openings cache: {e}. Will re-download.")

        # Try to download
        success = await self.download_and_build_cache()
        if not success:
            logger.warning("Using fallback basic opening database.")
            self.openings_map = {"uci": {}, "epd": {}}
            for epd, info in FALLBACK_OPENINGS.items():
                self.openings_map["epd"][epd] = info
        self.loaded = True

    async def download_and_build_cache(self) -> bool:
        """Downloads Lichess TSV files, parses them, and saves to cache."""
        temp_map = {"uci": {}, "epd": {}}
        async with aiohttp.ClientSession() as session:
            for url in TSV_URLS:
                logger.info(f"Downloading chess openings database: {url}")
                try:
                    async with session.get(url, timeout=15) as response:
                        if response.status != 200:
                            logger.error(f"Failed to download {url}: HTTP {response.status}")
                            return False
                        
                        text = await response.text()
                        lines = text.splitlines()
                        if not lines:
                            continue
                        
                        # Find headers
                        header = lines[0].strip().split("\t")
                        try:
                            eco_idx = header.index("eco")
                            name_idx = header.index("name")
                            pgn_idx = header.index("pgn")
                        except ValueError as e:
                            logger.error(f"Missing expected TSV columns in header: {e}")
                            return False

                        for line in lines[1:]:
                            parts = line.strip().split("\t")
                            if len(parts) <= max(eco_idx, name_idx, pgn_idx):
                                continue
                            
                            eco = parts[eco_idx].strip()
                            name = parts[name_idx].strip()
                            pgn = parts[pgn_idx].strip()
                            
                            # Parse PGN moves to get EPD key and UCI sequence
                            board = chess.Board()
                            uci_moves = []
                            for token in pgn.split():
                                if not token or "." in token:
                                    continue
                                try:
                                    m = board.push_san(token)
                                    uci_moves.append(m.uci())
                                except Exception:
                                    break
                            
                            epd = board.epd().strip().rstrip(";")
                            uci_path = " ".join(uci_moves)
                            
                            info = {"eco": eco, "name": name}
                            temp_map["epd"][epd] = info
                            if uci_path:
                                temp_map["uci"][uci_path] = info
                except Exception as e:
                    logger.error(f"Error downloading/parsing openings from {url}: {e}")
                    return False
        
        if temp_map["epd"]:
            self.openings_map = temp_map
            try:
                with open(CACHE_FILE, "w", encoding="utf-8") as f:
                    json.dump(self.openings_map, f, ensure_ascii=False, indent=2)
                logger.info(f"Successfully cached {len(self.openings_map['epd'])} openings.")
                return True
            except Exception as e:
                logger.error(f"Error saving openings to cache: {e}")
                return True
        return False

    def get_opening(self, board: chess.Board, uci_moves: Optional[List[str]] = None, is_fen_load: bool = False) -> dict:
        """
        Retrieves the opening name, variation and ECO code for a given board position.
        Uses move-sequence and EPD transposition matching.
        """
        if not self.loaded:
            return {"eco": "", "name": "Loading opening database...", "variation": "", "status": "Loading"}

        if not is_fen_load and uci_moves:
            game_openings = self.get_opening_for_game(uci_moves)
            if game_openings:
                return game_openings[-1]

        # If it is a direct FEN load (not start position), we can't reliably look up without moves history
        if is_fen_load:
            # Check if starting position
            if board.fen() == chess.Board().fen():
                return {"eco": "", "name": "Starting Position", "variation": "", "status": "Book"}
            
            # Check if EPD matches a known theory position
            epd = board.epd().strip().rstrip(";")
            match = self.openings_map.get("epd", {}).get(epd)
            if match:
                full_name = match.get("name", "")
                opening_name = full_name
                variation_name = ""
                if ": " in full_name:
                    parts = full_name.split(": ", 1)
                    opening_name = parts[0]
                    variation_name = parts[1]
                return {
                    "eco": match.get("eco", ""),
                    "name": opening_name,
                    "variation": variation_name,
                    "status": "Book"
                }
            return {"eco": "", "name": "Opening identification unavailable", "variation": "", "status": "Unavailable"}

        # Starting position check
        if board.fen() == chess.Board().fen():
            return {"eco": "", "name": "Starting Position", "variation": "", "status": "Book"}

        # 1. Try move-sequence matching
        if uci_moves:
            uci_path = " ".join(uci_moves)
            match = self.openings_map.get("uci", {}).get(uci_path)
            if match:
                full_name = match.get("name", "")
                opening_name = full_name
                variation_name = ""
                if ": " in full_name:
                    parts = full_name.split(": ", 1)
                    opening_name = parts[0]
                    variation_name = parts[1]
                return {
                    "eco": match.get("eco", ""),
                    "name": opening_name,
                    "variation": variation_name,
                    "status": "Book"
                }

        # 2. Try transposition matching with EPD
        epd = board.epd().strip().rstrip(";")
        match = self.openings_map.get("epd", {}).get(epd)
        if match:
            full_name = match.get("name", "")
            opening_name = full_name
            variation_name = ""
            if ": " in full_name:
                parts = full_name.split(": ", 1)
                opening_name = parts[0]
                variation_name = parts[1]
            return {
                "eco": match.get("eco", ""),
                "name": opening_name,
                "variation": variation_name,
                "status": "Book"
            }

        # Position is out of theory. Find the deepest matching opening prefix
        # so we can show "Scotch Game (Out of Book)" rather than blank.
        if uci_moves:
            best_match = None
            for length in range(len(uci_moves) - 1, 0, -1):
                prefix = " ".join(uci_moves[:length])
                m = self.openings_map.get("uci", {}).get(prefix)
                if m and m.get("name"):
                    best_match = m
                    break
            if best_match:
                full_name = best_match.get("name", "")
                opening_name = full_name
                variation_name = ""
                if ": " in full_name:
                    parts = full_name.split(": ", 1)
                    opening_name = parts[0]
                    variation_name = parts[1]
                return {
                    "eco": best_match.get("eco", ""),
                    "name": opening_name,
                    "variation": variation_name,
                    "status": "Out of Book"
                }
        return {"eco": "", "name": "Out of Theory", "variation": "", "status": "Out of Book"}

    def get_opening_for_game(self, uci_moves: List[str]) -> List[dict]:
        """
        Processes a full game move-by-move and returns opening info at each step.
        Properly handles Out of Book detection and variation refinement.
        """
        results = []
        board = chess.Board()
        
        # Start position (before first move)
        results.append({
            "eco": "",
            "name": "Starting Position",
            "variation": "",
            "status": "Book"
        })
        
        last_found = {
            "eco": "",
            "name": "Starting Position",
            "variation": "",
            "status": "Book"
        }
        
        current_uci_list = []
        for uci in uci_moves:
            current_uci_list.append(uci)
            try:
                move = chess.Move.from_uci(uci)
                board.push(move)
            except Exception:
                break
                
            epd = board.epd().strip().rstrip(";")
            uci_path = " ".join(current_uci_list)
            
            # Lookup
            match = None
            if self.loaded:
                # 1. Try uci path
                match = self.openings_map.get("uci", {}).get(uci_path)
                if not match:
                    # 2. Try EPD transposition
                    match = self.openings_map.get("epd", {}).get(epd)
                    
            if match:
                full_name = match.get("name", "")
                opening_name = full_name
                variation_name = ""
                if ": " in full_name:
                    parts = full_name.split(": ", 1)
                    opening_name = parts[0]
                    variation_name = parts[1]
                    
                last_found = {
                    "eco": match.get("eco", ""),
                    "name": opening_name,
                    "variation": variation_name,
                    "status": "Book"
                }
                results.append(last_found.copy())
            else:
                # Out of book — retain last found opening name but mark status
                out_item = last_found.copy()
                out_item["status"] = "Out of Book"
                # Ensure name is never empty (use fallback if needed)
                if not out_item.get("name"):
                    out_item["name"] = "Out of Theory"
                results.append(out_item)
                
        return results
