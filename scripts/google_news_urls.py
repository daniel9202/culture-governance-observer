#!/usr/bin/env python3
"""Resolve Google News RSS article links to their publisher URLs."""
from __future__ import annotations

import base64
import html
import json
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass

USER_AGENT = "Mozilla/5.0 Culture Governance Observer/1.0"


@dataclass(frozen=True)
class Resolution:
    url: str
    method: str
    error: str = ""


def is_google_news_url(url: str) -> bool:
    return urllib.parse.urlparse(url).hostname in {"news.google.com", "news.google.com.tw"}


def _request(url: str, data: bytes | None = None, headers: dict[str, str] | None = None):
    request_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=request_headers), timeout=25)


def follow_redirect(url: str) -> Resolution:
    try:
        with _request(url) as response:
            final = response.geturl()
        if final and not is_google_news_url(final):
            return Resolution(final, "redirect")
        return Resolution("", "redirect", "HTTP 最終網址仍是 Google News")
    except Exception as exc:
        return Resolution("", "redirect", f"{type(exc).__name__}: {exc}")


def decode_base64_url(url: str) -> Resolution:
    token = urllib.parse.urlparse(url).path.rstrip("/").split("/")[-1]
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    except Exception as exc:
        return Resolution("", "base64", f"{type(exc).__name__}: {exc}")
    match = re.search(rb"https?://[^\x00-\x20\"']+", raw)
    if not match:
        return Resolution("", "base64", "base64 內容沒有明文網址")
    resolved = match.group(0).decode("utf-8", "replace")
    return Resolution(resolved, "base64")


def decode_batchexecute(url: str) -> Resolution:
    token = urllib.parse.urlparse(url).path.rstrip("/").split("/")[-1]
    try:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        locale = {key: query.get(key, [default])[0] for key, default in (("hl", "en-US"), ("gl", "US"), ("ceid", "US:en"))}
        article_page = "https://news.google.com/rss/articles/" + urllib.parse.quote(token) + "?" + urllib.parse.urlencode(locale)
        with _request(article_page) as response:
            page = response.read().decode("utf-8", "replace")
        signature = re.search(r'data-n-a-sg="([^"]+)"', page)
        timestamp = re.search(r'data-n-a-ts="([^"]+)"', page)
        if not signature or not timestamp:
            return Resolution("", "batchexecute", "入口頁缺少簽章或時間戳")
        context = [
            ["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1, None, None, None, None, None, 0, 1],
            "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0,
        ]
        request_value = ["garturlreq", context, token, int(timestamp.group(1)), signature.group(1)]
        envelope = [[["Fbv4je", json.dumps(request_value, separators=(",", ":")), None, "generic"]]]
        body = urllib.parse.urlencode({"f.req": json.dumps(envelope, separators=(",", ":"))}).encode()
        endpoint = "https://news.google.com/_/DotsSplashUi/data/batchexecute"
        with _request(endpoint, body, {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"}) as response:
            result = response.read().decode("utf-8", "replace")
        response_body = result.split("\n\n", 1)[1] if "\n\n" in result else result
        response_body = response_body.lstrip()
        if response_body.startswith(")]}'"):
            response_body = response_body.split("\n", 1)[1]
        for entry in json.loads(response_body):
            if not isinstance(entry, list) or len(entry) < 3 or entry[0] != "wrb.fr" or not isinstance(entry[2], str):
                continue
            payload = json.loads(entry[2])
            if isinstance(payload, list) and len(payload) > 1 and payload[0] == "garturlres":
                resolved = html.unescape(payload[1])
                if resolved.startswith(("http://", "https://")) and not is_google_news_url(resolved):
                    return Resolution(resolved, "batchexecute")
        return Resolution("", "batchexecute", "回應中沒有原始新聞網址")
    except Exception as exc:
        return Resolution("", "batchexecute", f"{type(exc).__name__}: {exc}")


def resolve(url: str) -> Resolution:
    if not is_google_news_url(url):
        return Resolution(url, "original")
    errors = []
    for resolver in (follow_redirect, decode_base64_url, decode_batchexecute):
        result = resolver(url)
        if result.url:
            return result
        errors.append(f"{result.method}: {result.error}")
    return Resolution("", "failed", "；".join(errors))
