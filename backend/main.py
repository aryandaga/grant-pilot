from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Grant Pilot backend running"}