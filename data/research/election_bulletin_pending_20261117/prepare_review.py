"""Prepare review-only records; never writes data/input or publishes anything."""
import csv
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path
from transcriptions import UNITS

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = Path(os.environ.get('BULLETIN_RESEARCH_ROOT', r'D:\Projects\文化治理觀察站\data\research\mayor_bulletins_20261116'))
NOW = datetime.now().astimezone().isoformat(timespec='seconds')
DEVICE = os.environ.get('COMPUTERNAME', 'DANASUS') + '-Codex'
assert DEVICE == 'DANASUS-Codex', DEVICE
manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8-sig'))
docs = {d['filename'][:3]: d for d in manifest['documents']}
registry = list(csv.DictReader((ROOT / 'data/input/registered_candidates.csv').open(encoding='utf-8-sig', newline='')))
registry = {(r['city'], r['candidate']): r for r in registry if r['office'] == '縣市長'}
fields = next(csv.reader((ROOT / 'data/input/candidates.csv').open(encoding='utf-8-sig', newline='')))
known_tags = {r['tag'] for r in csv.DictReader((ROOT / 'config/topic_categories.csv').open(encoding='utf-8-sig', newline=''))}
titles = {
    '臺北市': '臺北市第9屆市長/臺北市議會第15屆議員選舉 選舉公報',
    '新北市': '新北市第5屆市長選舉選舉公報',
    '桃園市': '桃園市第4屆市長選舉選舉公報',
    '臺中市': '臺中市第5屆市長 臺中市議會第5屆議員選舉選舉公報',
    '臺南市': '臺南市第5屆市長選舉選舉公報',
    '高雄市': '高雄市第5屆市長選舉選舉公報',
    '宜蘭縣': '臺灣省宜蘭縣第二十屆縣長選舉 議會第二十一屆議員選舉第一、十一、十二選舉區 選舉公報',
    '新竹市': '臺灣省新竹市第12屆市長選舉選舉公報',
    '新竹縣': '臺灣省新竹縣第二十屆縣長選舉選舉公報',
    '苗栗縣': '臺灣省苗栗縣第二十屆縣長選舉選舉公報',
    '彰化縣': '臺灣省彰化縣第二十屆縣長選舉選舉公報',
    '雲林縣': '臺灣省雲林縣第20屆縣長選舉選舉公報',
    '嘉義市': '臺灣省嘉義市第12屆市長選舉選舉公報',
    '嘉義縣': '臺灣省嘉義縣第20屆縣長選舉選舉公報',
    '屏東縣': '臺灣省屏東縣第二十屆縣長選舉選舉公報',
    '臺東縣': '臺灣省臺東縣第20屆縣長選舉 選舉公報',
    '花蓮縣': '臺灣省花蓮縣第二十屆縣長選舉選舉公報',
    '澎湖縣': '臺灣省澎湖縣第20屆縣長選舉選舉公報',
    '金門縣': '福建省金門縣第9屆縣長、縣議員選舉 選舉公報',
    '基隆市': '臺灣省基隆市第20屆市長選舉選舉公報',
}
records, sheet_rows, fidelity = [], [], []
for city, name, title, original, tags in UNITS:
    reg = registry[(city, name)]
    doc = docs[city]
    raw = (SOURCE / 'pdf' / doc['filename']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == doc['sha256']
    tag_list = tags.split('||')
    # Use existing taxonomy only; do not add shared configuration.
    tag_list = ['文化產業' if t == '文創' else t for t in tag_list]
    assert set(tag_list) <= known_tags, set(tag_list) - known_tags
    rid = 'candidate-bulletin-2026-' + hashlib.sha256((city + name + original).encode()).hexdigest()[:16]
    notes = '來源頁面沒有發布日期；公報公告日期待查，未以投票日、下載日或PDF建立時間代填。公報政見已與原檔畫面逐字對照；僅移除版面換行與條次，未改原詞。'
    name_only = name == '蘇巧慧' and not title
    if name_only:
        notes += '此政策單元僅列項目名稱，未載具體措施，不補寫措施。'
    if name in {'蔣萬安', '張善政', '賴瑞隆', '陳素月', '王美惠', '吳秀華', '陳玉珍', '謝國樑', '陳振中'}:
        notes += '同一原句包含文化及其他領域內容，保留完整原句；文化分類僅指相關部分。'
    if name == '陳玉珍' and '這邊唱' in original:
        notes += '「這邊唱演唱會」照公報原字保留，未代為更正。'
    if name == '鄭朝方' and '文化傳承' in original:
        notes += '「傳承客家、原住民文化傳承」照公報原字保留。'
    summary = title or original.split('||')[0].split('。')[0]
    if not title and '。' in original.split('||')[0]:
        summary += '。'
    row = dict.fromkeys(fields, '')
    row.update(id=rid, city=city, office='縣市長', candidate=name,
               party='無黨籍' if reg['party'] in {'無', '無黨籍'} else reg['party'],
               topics='|'.join(dict.fromkeys(tag_list)), summary=summary,
               concrete_proposals='' if name_only else original,
               source_title=titles[city], source_url=doc['url'], source_type='選舉公報',
               last_verified='2026-11-17', proposer_role='候選人', content_nature='本屆競選政見',
               role_evidence=reg['source_url'], editor_notes=notes, review_status='AI初審待複核',
               policy_title=title)
    assert not row['official_topic'] and not row['official_subtopic'] and not row['published_date']
    records.append(row)
    # 48 existing columns A:AV. No new Sheet or production column is introduced.
    values = [''] * 48
    entries = {0:'候選人政見', 1:NOW, 2:city, 4:city+'選舉委員會', 5:titles[city],
               6:doc['url'], 7:'pending', 8:summary, 9:row['topics'],
               10:'官方選舉公報文化政策單元；已逐字對照PDF畫面。公告日期待查，交由使用者審核。',
               12:name, 13:row['party'], 14:'縣市長', 15:row['concrete_proposals'],
               16:notes, 20:'complete', 21:DEVICE, 23:NOW, 25:rid,
               26:title, 28:rid, 29:original, 30:'本屆競選政見',
               43:'新增政見', 45:json.dumps(row, ensure_ascii=False, separators=(',',':'))}
    for col, value in entries.items():
        values[col] = value
    sheet_rows.append(values)
    fidelity.append({'record_id':rid, 'city':city, 'candidate':name,
                     'pdf_filename':doc['filename'], 'pdf_sha256':doc['sha256'],
                     'pdf_page_1_based':1, 'verification':'PDF raster image compared manually, not OCR-only',
                     'verbatim_text_sha256':hashlib.sha256(original.encode()).hexdigest(),
                     'reviewed_by':DEVICE, 'reviewed_at':NOW})
assert len({r['id'] for r in records}) == len(records)
bundle = {'prepared_at':NOW, 'device':DEVICE, 'status':'pending', 'production_rows_written':0,
          'record_count':len(records), 'candidate_count':len({(r['city'],r['candidate']) for r in records}),
          'city_count':len({r['city'] for r in records}), 'records':records, 'sheet_rows':sheet_rows}
(HERE/'pending_records.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(HERE/'fidelity_log.json').write_text(json.dumps(fidelity,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(HERE/'source_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# The scope log contains observations, never verbatim source claims.
(HERE/'screening_scope.json').write_bytes((SOURCE/'image_review.json').read_bytes())
print(json.dumps({k:v for k,v in bundle.items() if k not in {'records','sheet_rows'}},ensure_ascii=False))
