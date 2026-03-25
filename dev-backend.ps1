$env:PATH = "C:\Users\yong\AppData\Local\Programs\Python\Python313;$env:PATH"
python -m uvicorn api.index:app --reload --port 8000
