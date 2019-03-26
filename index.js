'use strict';
const cheerio = require('cheerio');
const fs = require('fs');
const util = require('util');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const utc = require('dayjs/plugin/utc');
const schedule = require('node-schedule');
const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
const data = require('./data.json');

dayjs.extend(customParseFormat);
dayjs.extend(utc);

const messageIDs = new Map();
const channels = new Map(data.channel);
const failed = [];
let username;
let results = [];
let pubDate = dayjs();

const bot = new TelegramBot(data.key, {
  polling: {
    interval: 0,
    params: {timeout: 60}
  }
});

const saveData = function() {
  data.channel = [...channels];
  fs.writeFile('data.json', JSON.stringify(data), () => {});
};

bot.getMe().then((me) => {
  username = me.username;

  bot.onText(/^\/(\w+)@?(\w*)/i, (msg, regex) => {
    if (regex[2] && regex[2] !== me.username) {
      return;
    }
    if (msg.chat.type === 'private') {
      console.log('%s(%s) => %s: %s', msg.from.username, msg.from.id, me.username, msg.text);
    } else {
      if (regex[2] !== me.username) {
        return;
      }
      console.log('%s(%s) => %s(%s): %s', msg.from.username, msg.from.id, msg.chat.title, msg.chat.id, msg.text);
    }

    switch (regex[1]) {
      case 'start':
        if (msg.text.match(/\w{32}$/)) {
          bot.sendMessage(msg.chat.id, `<pre>magnet:?xt=urn:btih:${msg.text.replace(/\/start@?\w*\s/i, '')}</pre>`, {parse_mode: 'HTML'});
        }
        break;
      case 'search':
        search(msg);
        break;
      case 'subscribe':
        if (channels.has(msg.chat.id)) {
          if (msg.chat.type === 'private') {
            bot.sendMessage(msg.chat.id, '您已經在訂閱清單中了！\n若要更改關鍵字請先輸入 /unsubscribe 取消訂閱');
          } else {
            bot.sendMessage(msg.chat.id, '這個聊天室已經在訂閱清單中了！\n若要更改關鍵字請先輸入 /unsubscribe 取消訂閱');
          }
          return;
        }
        if (msg.text.match(/\s(.+)/)) {
          channels.set(msg.chat.id, msg.text.match(/\s(.+)/)[1]);
          saveData();
        } else {
          channels.set(msg.chat.id);
          saveData();
        }
        if (msg.chat.type === 'private') {
          bot.sendMessage(msg.chat.id, '訂閱成功！\n當有更新時會向您發送訊息');
        } else {
          bot.sendMessage(msg.chat.id, '訂閱成功！\n當有更新時會向這個聊天室發送訊息');
        }
        break;
      case 'unsubscribe':
        if (channels.delete(msg.chat.id)) {
          saveData();
          console.log(msg.chat.id + ' remove from subscription list.');
          if (msg.chat.type === 'private') {
            bot.sendMessage(msg.chat.id, '已將您從訂閱清單中刪除！');
          } else {
            bot.sendMessage(msg.chat.id, '已將此聊天室從訂閱清單中刪除！');
          }
        } else {
          bot.sendMessage(msg.chat.id, '尚未訂閱！\n輸入 /subscribe 來訂閱');
        }
        break;
    }
  });

  bot.onText(/https?:\/\/share\.dmhy\.org\/topics\/view\/.*\.html/ig, (msg, regex) => {
    request(regex[0], (error, response, body) => {
      if (error || response.statusCode !== 200) {
        return;
      }
      const $ = cheerio.load(body);
      const link = $('#magnet2').text();
      const torrent = $('#tabs-1 a').attr('href');
      if (link && torrent) {
        bot.sendMessage(msg.chat.id, util.format(`<a href="https:${torrent}">${link}</a>`), {
          reply_to_message_id: msg.message_id,
          parse_mode: 'HTML'
        });
      }
    });
  });

  bot.on('new_chat_members', (msg) => {
    if (msg.new_chat_member.username === me.username) {
      console.log('join %s(%s)', msg.chat.title, msg.chat.id);
      channels.set(msg.chat.id);
      saveData();
    }
  });

  bot.on('left_chat_member', (msg) => {
    if (msg.left_chat_member.username === me.username) {
      console.log('left %s(%s)', msg.chat.title, msg.chat.id);
      channels.delete(msg.chat.id);
      saveData();
    }
  });

  bot.on('migrate_to_chat_id', (msg) => {
    console.log('migrate chat from %s to %s', msg.chat.id, msg.migrate_to_chat_id);
    channels.delete(msg.chat.id);
    channels.set(msg.migrate_to_chat_id);
  });
});

const search = function(msg) {
  if (!msg.text.match(/\s(.+)/)) {
    bot.sendMessage(msg.chat.id, '請輸入要搜尋的關鍵字！\n範例：/search 果 青\n僅顯示五個結果\n更多資訊請看 https://share.dmhy.org/cms/page/name/faq.html#faq3');
    return;
  }

  const keyword = encodeURI(msg.text.match(/\s(.+)/)[1].replace(' ', '+'));
  request('http://share.dmhy.org/topics/rss/rss.xml?keyword=' + keyword, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      bot.sendMessage(msg.chat.id, '抓取結果時發生錯誤！');
      return;
    }
    const processItem = function() {
      $('item').each((i, elem) => {
        if (i < 5) {
          const date = dayjs($(elem).children('pubDate').text());
          result.push(util.format('%s <code>%s</code>\n<a href="%s">%s</a> <a href="%s">*</a>',
              date.locale('zh-tw').local().format('YYYY/M/D HH:mm'),
              $(elem).children('category').text(),
              $(elem).children('link').text(),
              $(elem).children('title').text().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
              `tg://resolve?domain=${username}&start=${$(elem).children('enclosure').attr('url').substr(20, 32)}`
          ));
        }
      });
      bot.sendMessage(msg.chat.id, result.join('\n\n'), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        disable_notification: true
      });
    };

    const result = [];
    const $ = cheerio.load(body, {
      xmlMode: true
    });
    if ($('item').index() > 0) {
      processItem();
    } else {
      bot.sendMessage(msg.chat.id, '找不到任何結果！');
    }
  });
};

const getUpdate = function() {
  request('https://share.dmhy.org/topics/rss/rss.xml', (err, res, body) => {
    if (err || res.statusCode !== 200) {
      console.log('update fetch failed!');
      return;
    }

    let tmpTime;
    const tmpData = [];
    const $ = cheerio.load(body, {
      xmlMode: true
    });

    $('item').each((i, elem) => {
      const date = dayjs($(elem).children('pubDate').text());
      if (pubDate.isBefore(date)) {
        tmpData.push(util.format('%s <code>%s</code>\n<a href="%s">%s</a> <a href="%s">*</a>',
            date.locale('zh-tw').local().format('HH:mm'),
            $(elem).children('category').text(),
            $(elem).children('link').text(),
            $(elem).children('title').text().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
            `tg://resolve?domain=${username}&start=${$(elem).children('enclosure').attr('url').substr(20, 32)}`
        ));

        if (!tmpTime) tmpTime = date;
      }
    });
    if (tmpData.length !== 0) {
      results = tmpData.concat(results);
    }
    if (tmpTime) {
      pubDate = tmpTime;
    }
    if (results.length === 0) {
      return;
    }
    let messages;
    channels.forEach((filter, channel) => {
      if (filter) {
        messages = results.slice().filter((message) => message.match(new RegExp(filter, 'i'))).reverse();
        if (messages.length === 0) {
          return;
        }
      } else {
        messages = results.slice().reverse();
      }

      if (messageIDs.get(channel)) {
        bot.editMessageText(messages.join('\n\n'), {
          chat_id: channel,
          message_id: messageIDs.get(channel),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          disable_notification: true
        }).catch(() => {});
      } else {
        bot.sendMessage(channel, messages.join('\n\n'), {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          disable_notification: true
        }).then((msg) => {
          messageIDs.set(msg.chat.id, msg.message_id);
        }).catch((e) => {
          console.log('Send Update to %s failed! Error: %s', channel, e.message);
          if (failed.indexOf(channel) > -1) {
            channels.delete(channel);
            saveData();
          } else if (e.code === 'ETELEGRAM' && e.response.body.error_code >= 400 && e.response.body.error_code < 500 ) {
            failed.push(channel);
          }
        });
      }
    });
  });
};

schedule.scheduleJob('0 * * * * *', getUpdate);
schedule.scheduleJob('0 * * * *', () => {
  messageIDs.clear();
  results = [];
});
