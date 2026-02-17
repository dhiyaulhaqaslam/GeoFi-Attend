run backend:
  cd backend && npx ts-node-dev src/server.ts

run frontend:
  cd frontend && npm start

run face service (wajah) — wajib agar absen dengan verifikasi wajah jalan:
  1. cd face_service
  2. Gunakan Python 3.10, 3.11, atau 3.12 (bukan 3.14). Buat venv:
       py -3.11 -m venv .venv
     (atau python -m venv .venv jika python --version sudah 3.10–3.12)
  3. .venv\Scripts\activate
  4. pip install -r requirements.txt
  5. python -m uvicorn app:app --host 127.0.0.1 --port 8001

  Jika pip install gagal (error Visual C++ / CMake / build wheel): venv Anda mungkin pakai Python 3.14.
  Hapus .venv, instal Python 3.11 dari python.org, lalu buat ulang venv dengan: py -3.11 -m venv .venv
  Detail: lihat face_service/README.md