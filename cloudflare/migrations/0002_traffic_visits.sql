-- 每日匿名訪客代碼僅用於去重；不儲存 IP、帳號或瀏覽內容。
CREATE TABLE IF NOT EXISTS traffic_visits (
  day TEXT NOT NULL,
  page_path TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day, page_path, visitor_id)
);

CREATE INDEX IF NOT EXISTS traffic_visits_day_idx ON traffic_visits(day);
