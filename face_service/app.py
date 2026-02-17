from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import base64
import numpy as np
import cv2

from insightface.app import FaceAnalysis

app = FastAPI(title="Face Service", version="1.0")

# Inisialisasi model (CPU)
# providers bisa diganti jika pakai GPU
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))

DEFAULT_THRESHOLD = 0.45  # cosine distance threshold (tuning nanti)


def decode_base64_image(data_url_or_b64: str) -> np.ndarray:
    if not data_url_or_b64:
        raise ValueError("empty image")
    s = data_url_or_b64.strip()
    if s.startswith("data:"):
        # data:image/jpeg;base64,....
        s = s.split(",", 1)[1]
    img_bytes = base64.b64decode(s)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("invalid image bytes")
    return img


def get_single_face_embedding(img_bgr: np.ndarray) -> np.ndarray:
    faces = face_app.get(img_bgr)
    if not faces:
        raise ValueError("no face detected")
    # kalau banyak wajah, ambil yang terbesar
    faces.sort(key=lambda f: (f.bbox[2]-f.bbox[0])
               * (f.bbox[3]-f.bbox[1]), reverse=True)
    emb = faces[0].embedding  # numpy float32 (512,)
    if emb is None or emb.size == 0:
        raise ValueError("embedding empty")
    # normalize untuk cosine
    emb = emb.astype(np.float32)
    emb = emb / (np.linalg.norm(emb) + 1e-9)
    return emb


def emb_to_b64(emb: np.ndarray) -> str:
    # float32 raw bytes -> base64
    b = emb.astype(np.float32).tobytes()
    return base64.b64encode(b).decode("ascii")


def b64_to_emb(b64str: str) -> np.ndarray:
    raw = base64.b64decode(b64str)
    emb = np.frombuffer(raw, dtype=np.float32)
    # normalize (defensive)
    emb = emb / (np.linalg.norm(emb) + 1e-9)
    return emb


def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    # if a,b normalized, cosine similarity = dot
    sim = float(np.dot(a, b))
    # distance = 1 - sim
    return float(1.0 - sim)


class EmbedReq(BaseModel):
    image_base64: str


class EmbedRes(BaseModel):
    model: str
    embedding_b64: str


@app.post("/embed", response_model=EmbedRes)
def embed(req: EmbedReq):
    try:
        img = decode_base64_image(req.image_base64)
        emb = get_single_face_embedding(img)
        return {"model": "insightface/buffalo_l", "embedding_b64": emb_to_b64(emb)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class VerifyReq(BaseModel):
    image_base64: str
    templates_b64: list[str]
    threshold: float | None = None


class VerifyRes(BaseModel):
    match: bool
    best_distance: float
    threshold: float
    model: str


@app.post("/verify", response_model=VerifyRes)
def verify(req: VerifyReq):
    if not req.templates_b64:
        raise HTTPException(status_code=400, detail="no templates")
    thr = float(
        req.threshold if req.threshold is not None else DEFAULT_THRESHOLD)

    try:
        img = decode_base64_image(req.image_base64)
        probe = get_single_face_embedding(img)

        best = 999.0
        for t in req.templates_b64:
            emb = b64_to_emb(t)
            d = cosine_distance(probe, emb)
            if d < best:
                best = d

        return {
            "match": best <= thr,
            "best_distance": float(best),
            "threshold": thr,
            "model": "insightface/buffalo_l",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/health")
def health():
    return {"status": "OK"}
