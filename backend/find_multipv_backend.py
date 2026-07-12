with open(r"C:\Users\KIIT\.gemini\antigravity\scratch\mouseslip\backend\main.py", "r", encoding="utf-8") as f:
    for num, line in enumerate(f, 1):
        if "multipv" in line.lower() or "pv2" in line.lower() or "second_best" in line.lower():
            print(f"{num}: {line.strip()}")
