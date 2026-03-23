import sqlite3
import os

db_path = r'C:\Users\ELBOSTAN\Desktop\MutqinApp\assets\database\ayat.db'
size = os.path.getsize(db_path)
print(f'File size: {size:,} bytes ({size / 1024 / 1024:.2f} MB)')

# Check if it's a valid SQLite file (starts with SQLite magic bytes)
with open(db_path, 'rb') as f:
    header = f.read(16)
    magic = header[:15]
    print(f'Magic header: {magic}')
    print(f'Is valid SQLite: {magic == b"SQLite format 3"}')

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# List all tables
cur.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
rows = cur.fetchall()
print(f'\nTables/views found: {len(rows)}')
for r in rows:
    print(f'  {r[1]:6s}  {r[0]}')

# Check specifically for M0_ayainfo
cur.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='M0_ayainfo'")
cnt = cur.fetchone()[0]
print(f'\nM0_ayainfo exists: {cnt > 0}')

if cnt > 0:
    cur.execute('SELECT count(*) FROM M0_ayainfo')
    row_count = cur.fetchone()[0]
    print(f'M0_ayainfo row count: {row_count}')
    cur.execute('PRAGMA table_info(M0_ayainfo)')
    cols = cur.fetchall()
    print(f'Columns: {[c[1] for c in cols]}')
else:
    print('ERROR: M0_ayainfo table is MISSING from the bundled DB file!')
    print('The ayat.db asset needs to be rebuilt with: node scripts/build-sqlite-db.js')

conn.close()
