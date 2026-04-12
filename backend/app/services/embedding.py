from sentence_transformers import SentenceTransformer

# Load model once at import time
model = SentenceTransformer("all-MiniLM-L6-v2")


def generate_embedding(text: str) -> list[float]:
    """Return a 384-dim embedding vector for *text*."""
    return model.encode(text).tolist()
