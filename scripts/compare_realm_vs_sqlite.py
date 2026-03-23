"""
compare_realm_vs_sqlite.py

Compares the Realm binary file(s), the ayah_coordinates.json intermediate,
and the final ayat.db SQLite file to pinpoint exactly where data goes missing.

Run:  python scripts/compare_realm_vs_sqlite.py
"""

import os
import struct
import sqlite3
import json

ROOT = os.path.join(os.path.dirname(__file__), '..')

REALM_PATH        = os.path.join(ROOT, 'assets', 'database', 'ayat.realm')
REALM_V9_PATH     = os.path.join(ROOT, 'assets', 'database', 'ayat.v9.backup.realm')
JSON_PATH         = os.path.join(ROOT, 'assets', 'database', 'ayah_coordinates.json')
SQLITE_PATH       = os.path.join(ROOT, 'assets', 'database', 'ayat.db')

ORIG_REALM_PATH   = os.path.join(ROOT, 'to_take_in_review', 'app', 'src', 'main', 'assets', 'ayat.realm')
ORIG_REALM_V9     = os.path.join(ROOT, 'to_take_in_review', 'app', 'src', 'main', 'assets', 'ayat.v9.backup.realm')

SEP = '=' * 70

def file_info(label, path):
    if os.path.exists(path):
        size = os.path.getsize(path)
        print(f"  {label:40s}  {size:>12,} bytes  ({size/1024/1024:.2f} MB)")
    else:
        print(f"  {label:40s}  *** NOT FOUND ***")

def realm_header_info(path):
    """Read Realm file header and extract version + top-level info."""
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        header = f.read(24)
    magic = header[:8]
    is_realm = (magic == b'\x00\x00\x00\x00\x00\x00\x00\x00' or
                b'realmdb' in header.lower() or
                magic[:4] == b'\x00\x00\x00\x00')
    # Realm stores a 4-byte little-endian file format version at offset 4
    version = struct.unpack_from('<I', header, 4)[0] if len(header) >= 8 else None
    return {
        'magic_hex': magic.hex(),
        'header_hex': header.hex(),
        'version_word': version,
        'size': os.path.getsize(path),
    }

def count_occurrences_in_binary(path, search_bytes):
    """Count how many times search_bytes appears in the file (rough heuristic)."""
    if not os.path.exists(path):
        return -1
    with open(path, 'rb') as f:
        data = f.read()
    return data.count(search_bytes)

def sqlite_info(path):
    if not os.path.exists(path):
        return None
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [r[0] for r in cur.fetchall()]
    info = {'size': os.path.getsize(path), 'tables': {}}
    for t in tables:
        if t.startswith('sqlite_'):
            continue
        cur.execute(f"SELECT count(*) FROM [{t}]")
        cnt = cur.fetchone()[0]
        cur.execute(f"PRAGMA table_info([{t}])")
        cols = [r[1] for r in cur.fetchall()]
        # Sample first and last row
        cur.execute(f"SELECT * FROM [{t}] LIMIT 1")
        first = cur.fetchone()
        cur.execute(f"SELECT * FROM [{t}] ORDER BY rowid DESC LIMIT 1")
        last = cur.fetchone()
        info['tables'][t] = {'count': cnt, 'columns': cols, 'first': first, 'last': last}
    conn.close()
    return info

def json_info(path):
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        raw = f.read()
    size = len(raw)
    data = json.loads(raw)
    info = {'size': size, 'keys': list(data.keys()), 'counts': {}}
    for k, v in data.items():
        info['counts'][k] = len(v) if isinstance(v, list) else 'N/A'
    return info

# ─────────────────────────────────────────────────────────────────────────────
print(SEP)
print('FILE SIZES')
print(SEP)
file_info('assets/database/ayat.realm',          REALM_PATH)
file_info('assets/database/ayat.v9.backup.realm', REALM_V9_PATH)
file_info('to_take_in_review/...ayat.realm',      ORIG_REALM_PATH)
file_info('to_take_in_review/...ayat.v9.backup',  ORIG_REALM_V9)
file_info('assets/database/ayah_coordinates.json',JSON_PATH)
file_info('assets/database/ayat.db',              SQLITE_PATH)

# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print('REALM FILE HEADERS (raw bytes)')
print(SEP)
for label, path in [
    ('assets/database/ayat.realm',          REALM_PATH),
    ('assets/database/ayat.v9.backup.realm',REALM_V9_PATH),
    ('to_take_in_review/...ayat.realm',     ORIG_REALM_PATH),
]:
    h = realm_header_info(path)
    if h:
        print(f"  {label}")
        print(f"    Size       : {h['size']:,} bytes")
        print(f"    First 24B  : {h['header_hex']}")
        print(f"    Version?   : {h['version_word']}")
    else:
        print(f"  {label}: NOT FOUND")

# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print('REALM FILES — string/table occurrence heuristics')
print(SEP)
# Look for table name strings embedded in the Realm file
for search_str in ['M0_ayainfo', 'Ayat', 'page_number', 'sura_number']:
    sb = search_str.encode('utf-8')
    for label, path in [
        ('ayat.realm',          REALM_PATH),
        ('ayat.v9.backup.realm',REALM_V9_PATH),
        ('ORIG ayat.realm',     ORIG_REALM_PATH),
    ]:
        cnt = count_occurrences_in_binary(path, sb)
        if cnt >= 0:
            print(f"  '{search_str}' in {label}: {cnt} occurrences")

# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print('JSON INTERMEDIATE FILE')
print(SEP)
ji = json_info(JSON_PATH)
if ji:
    print(f"  Size  : {ji['size']:,} bytes ({ji['size']/1024/1024:.2f} MB)")
    print(f"  Keys  : {ji['keys']}")
    for k, cnt in ji['counts'].items():
        print(f"  [{k}] → {cnt} records")
else:
    print('  NOT FOUND — ayah_coordinates.json is missing!')
    print('  This is probably the root cause. Rebuild it from the Realm file.')

# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print('SQLITE DATABASE')
print(SEP)
si = sqlite_info(SQLITE_PATH)
if si:
    print(f"  Size  : {si['size']:,} bytes ({si['size']/1024/1024:.2f} MB)")
    for t, info in si['tables'].items():
        print(f"  [{t}]")
        print(f"    Columns : {info['columns']}")
        print(f"    Rows    : {info['count']:,}")
        print(f"    First   : {info['first']}")
        print(f"    Last    : {info['last']}")
else:
    print('  NOT FOUND')

# ─────────────────────────────────────────────────────────────────────────────
print()
print(SEP)
print('CONSISTENCY CHECK')
print(SEP)

if ji and si:
    for key in ji['keys']:
        json_cnt = ji['counts'].get(key, 0)
        db_info  = si['tables'].get(key, None)
        if db_info:
            db_cnt = db_info['count']
            match  = '✅' if json_cnt == db_cnt else '❌ MISMATCH'
            print(f"  {key}: JSON={json_cnt:,}  SQLite={db_cnt:,}  {match}")
        else:
            print(f"  {key}: JSON={json_cnt:,}  SQLite=TABLE MISSING ❌")
elif not ji:
    print('  Cannot compare — JSON file is missing.')
elif not si:
    print('  Cannot compare — SQLite file is missing.')

# Check for common Ayat counts (6236 is total ayahs in Quran)
if si and 'Ayat' in si['tables']:
    ayat_cnt = si['tables']['Ayat']['count']
    if ayat_cnt == 0:
        print(f"\n  ❌ CRITICAL: Ayat table is EMPTY — this will break all text queries!")
    elif ayat_cnt < 6236:
        print(f"\n  ⚠️  WARNING: Ayat table has {ayat_cnt} rows — expected 6236 (full Quran)")
    else:
        print(f"\n  ✅ Ayat table looks complete ({ayat_cnt} rows)")

if si and 'M0_ayainfo' in si['tables']:
    coord_cnt = si['tables']['M0_ayainfo']['count']
    if coord_cnt == 0:
        print(f"  ❌ CRITICAL: M0_ayainfo table is EMPTY — bounding boxes are missing!")
    else:
        print(f"  ✅ M0_ayainfo has {coord_cnt:,} coordinate rows")

print()
print(SEP)
