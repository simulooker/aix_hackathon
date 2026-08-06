# test_env.py
import os

from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

db_url = os.getenv("DATABASE_URL")

print("----------------------------------------")
print("실제 로드된 값:", repr(db_url))
print("----------------------------------------")