# dmhy-telegram
自動抓取動漫花園RSS並發到Telegram

## 需求
* Node.js 6+

## Docker
[Docker Hub](https://hub.docker.com/r/james58899/dmhy-telegram/)

**請將 `/usr/src/app/data.json` 掛載到外部並設定Telegram bot API token**

### 範例：
1. `curl https://raw.githubusercontent.com/james58899/dmhy-telegram/master/data.json > ~/dmhy-telegram.json`
2. `docker pull james58899/dmhy-telegram`
3. 編輯 `~/dmhy-telegram.json` 設定API token
4. `docker run -v ~/dmhy-telegram.json:/usr/src/app/data.json james58899/dmhy-telegram`
