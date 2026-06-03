# tools/clip-score.py
# 用 CLIP 把一批影格與一段英文 prompt 算相似度，挑「畫面最貼題」的影格。
# 供 make-demo 視覺配對：候選影片抽幀 → 本段英文 prompt 評分 → 取最高分影格時間點剪片段。
# 依賴：voice-engine venv 既有的 torch(cu124)+transformers+PIL（無需另裝 open_clip）。
# 用法：python tools/clip-score.py "<english prompt>" "<frames_dir>"
#   影格檔名須形如 f0001.jpg（序號），輸出 JSON：{best_index, best_file, score, n}
#   時間點由 make-demo 以 (best_index-1)*interval 推算。
import sys, json, glob, os

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "args: <prompt> <frames_dir>"})); return
    prompt = sys.argv[1]
    frames_dir = sys.argv[2]
    files = sorted(glob.glob(os.path.join(frames_dir, "*.jpg")))
    if not files:
        print(json.dumps({"error": "no frames"})); return
    try:
        from PIL import Image
        import torch
        from transformers import CLIPModel, CLIPProcessor
        device = "cuda" if torch.cuda.is_available() else "cpu"
        MODEL = os.environ.get("CLIP_MODEL", "openai/clip-vit-base-patch32")
        model = CLIPModel.from_pretrained(MODEL).to(device)
        proc = CLIPProcessor.from_pretrained(MODEL)
        imgs = [Image.open(f).convert("RGB") for f in files]
        inputs = proc(text=[prompt[:300]], images=imgs, return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            sims = model(**inputs).logits_per_image.squeeze(-1).tolist()
        if not isinstance(sims, list):
            sims = [sims]
        best = max(range(len(files)), key=lambda i: sims[i])
        print(json.dumps({"best_index": best, "best_file": os.path.basename(files[best]),
                          "score": round(float(sims[best]), 3), "n": len(files)}))
    except Exception as e:
        print(json.dumps({"error": str(e)[:200]}))

main()
