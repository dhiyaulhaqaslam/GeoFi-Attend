# Face Service (verifikasi wajah)

Layanan Python untuk embed & verify wajah (InsightFace). Wajib jalan di port 8001 agar fitur absen dengan wajah berfungsi.

## Persyaratan

- **Python 3.10, 3.11, atau 3.12** (disarankan 3.11).
- Jangan pakai **Python 3.14** untuk venv ini: banyak dependency (insightface, onnx, onnxruntime) belum punya wheel untuk 3.14 sehingga pip akan build dari sumber dan gagal tanpa Visual C++ Build Tools.

## Setup (Windows)

1. Pastikan ada Python 3.11 atau 3.12. Cek:
   ```powershell
   py -3.11 --version
   ```
   Jika belum ada, instal dari [python.org](https://www.python.org/downloads/) (pilih 3.11 atau 3.12).

2. Hapus venv lama (jika pakai Python 3.14):
   ```powershell
   Remove-Item -Recurse -Force .venv
   ```

3. Buat venv dengan Python 3.11 (atau 3.12):
   ```powershell
   py -3.11 -m venv .venv
   ```
   Jika hanya ada satu Python 3.11: `python -m venv .venv` (pastikan `python --version` = 3.10/3.11/3.12).

4. Aktifkan dan install:
   ```powershell
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

5. Jalankan:
   ```powershell
   python -m uvicorn app:app --host 127.0.0.1 --port 8001
   ```

Jika tetap gagal dengan error "Microsoft Visual C++ 14.0 or greater is required", instal [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) atau gunakan Python 3.11/3.12 dengan venv baru (lebih mudah).
