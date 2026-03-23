"""
inspect_json_schema.py
Prints the keys (column names) and a sample row for every table in
ayah_coordinates.json so we can write correct CREATE TABLE statements.
"""
import json, os

JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'assets', 'database', 'ayah_coordinates.json')

with open(JSON_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

SEP = '=' * 70
for table_name, rows in data.items():
    print(SEP)
    print(f'TABLE: {table_name}   ({len(rows):,} rows)')
    print(SEP)
    if not rows:
        print('  (empty)')
        continue
    sample = rows[0]
    for col, val in sample.items():
        py_type = type(val).__name__
        print(f'  {col:25s}  ({py_type})  sample={repr(val)}')
    print()
