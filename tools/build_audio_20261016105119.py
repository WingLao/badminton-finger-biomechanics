"""用 edge-tts（zh-TW-HsiaoChenNeural）生成 5 頁旁白（中學生版本）：assets/audio/step1.mp3 ~ step5.mp3，
並輸出逐詞時間軸 assets/audio/stepN.json（字幕同步用）。"""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

BASE = Path(__file__).resolve().parent.parent
VOICE = "zh-TW-YunJheNeural"  # 台灣男聲
LINES = [  # F2–F5 學生版本：淺白＋研究重點
    "第一步，輕輕握拍。大拇指和食指像拿筷子一樣夾住拍柄，其他三根手指輕輕靠著，手心留一點空間。研究發現，高手平時握得很輕，只在擊球前很短的時間才用力。看右邊，拍線那一面叫拍面，黃色箭頭就是拍面朝向。",
    "第二步，正手發力。擊球一瞬間，中指、無名指和小指一起握緊，手肘微微打直，前臂向內轉，像甩鞭子一樣把球拍揮出去。研究量到，手指最用力的地方在中指指尖，而且出現在觸球前大約二十到三十毫秒。看右邊，藍色球拍有用手指，灰色沒有，藍色打出的球更快更遠。",
    "第三步，反手發力。把大拇指貼在拍柄的一號面或八號面，擊球時大拇指往前推，其他手指一起握緊，前臂向外轉。看右邊，大拇指有推，球拍轉得更快，球也飛得更遠。",
    "第四步，網前小球。後面三根手指放鬆，只用大拇指、食指和中指，像轉筆一樣輕輕轉動拍柄，控制拍面角度。研究發現，放網前小球時，高手握拍的力量比初學者更小，時間也更短。看右邊，拍面只轉一點點，球的方向就不一樣。",
    "第五步，快速平抽。正手用食指壓，反手用大拇指推，輪流快速切換，每打完一球就馬上放鬆。研究發現，高手和初學者殺球時的最大握力差不多，但高手用力的時間只有大約零點四秒，初學者卻長達一點二秒。所以重點不是握得多大力，而是用力要短、要準。",
]


async def synth(i, text):
    out = BASE / "assets" / "audio" / f"step{i}.mp3"
    for attempt in range(3):
        try:
            com = edge_tts.Communicate(text, VOICE, rate="+12%", boundary="WordBoundary")
            words, audio = [], bytearray()
            async for chunk in com.stream():
                if chunk["type"] == "audio":
                    audio += chunk["data"]
                elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                    words.append({"t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7, "w": chunk["text"]})
            out.write_bytes(audio)
            (out.with_suffix(".json")).write_text(json.dumps({"text": text, "words": words}, ensure_ascii=False), encoding="utf-8")
            return len(words)
        except Exception as e:  # 網路不穩 → 重試
            print(f"retry step{i}: {e}", file=sys.stderr)
            await asyncio.sleep(2 * (attempt + 1))
    raise RuntimeError(f"step{i} failed")


async def main():
    (BASE / "assets" / "audio").mkdir(parents=True, exist_ok=True)
    counts = await asyncio.gather(*(synth(i + 1, t) for i, t in enumerate(LINES)))
    print("word timings:", counts)


asyncio.run(main())
