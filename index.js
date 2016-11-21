const cheerio = require('cheerio'),
    fs = require('fs'),
    util = require('util'),
    moment = require('moment'),
    schedule = require('node-schedule'),
    TelegramBot = require('node-telegram-bot-api'),
    request = require("request");

let username,
    messageIDs = [],
    results = [],
    pubDate = moment();

const config = JSON.parse(fs.readFileSync('data.json', 'utf8')),
    bot = new TelegramBot(config.key, {
        polling: {
            timeout: 60,
            interval: 0
        }
    });

bot.getMe().then(me => {
    username = me.username;
});

bot.onText(/^\/(\w+)@?\w*/i, (msg, regex) => {
    if (msg.chat.type === 'private') {
        console.log('%s(%s) => %s: %s', msg.from.username, msg.from.id, username, msg.text);
    }
    else console.log('%s(%s) => %s(%s): %s', msg.from.username, msg.from.id, msg.chat.title, msg.chat.id, msg.text);

    switch (regex[1]) {
    case 'search':
        search(msg);
        break;
    case 'subscribe':
        if (config.channel.indexOf(msg.chat.id) < 0) {
            config.channel.push(msg.chat.id);
            fs.writeFile('data.json', JSON.stringify(config));
            console.log(msg.chat.id + ' Add to subscription list.');
            bot.sendMessage(msg.chat.id, '已加入訂閱清單！');
        }
        else bot.sendMessage(msg.chat.id, '已經在訂閱清單中了！');
        break;
    case 'unsubscribe':
        if (config.channel.indexOf(msg.chat.id) > -1) {
            config.channel.splice(config.channel.indexOf(msg.chat.id), 1);
            fs.writeFile('data.json', JSON.stringify(config));
            console.log(msg.chat.id + ' remove from subscription list.');
            bot.sendMessage(msg.chat.id, '已從訂閱清單中刪除');
        }
        else bot.sendMessage(msg.chat.id, '尚未訂閱');
        break;
    }
});

bot.on('new_chat_participant', msg => {
    if (msg.new_chat_member.username === username) {
        console.log('join %s(%s)', msg.chat.title, msg.chat.id);
        if (config.channel.indexOf(msg.chat.id) < 0) {
            config.channel.push(msg.chat.id);
            fs.writeFile('data.json', JSON.stringify(config));
        }
    }
});

bot.on('left_chat_participant', msg => {
    if (msg.left_chat_member.username === username) {
        console.log('left %s(%s)', msg.chat.title, msg.chat.id);
        if (config.channel.indexOf(msg.chat.id) > -1) {
            config.channel.splice(config.channel.indexOf(msg.chat.id), 1);
            fs.writeFile('data.json', JSON.stringify(config));
        }
    }
});

const search = function (msg) {
    let keyword = msg.text.match(/\s(.+)/);
    if (!keyword) {
        bot.sendMessage(msg.chat.id, '請輸入要搜尋的關鍵字！\n範例：/search 果 青\n群組內僅顯示五個結果\n更多資訊請看 https://share.dmhy.org/cms/page/name/faq.html#faq3');
        return;
    }

    keyword = encodeURI(keyword[1].replace(' ', '+'));
    request('https://share.dmhy.org/topics/rss/sort_id/31/rss.xml?keyword=' + keyword, (err, res, body) => {
        if (err || res.statusCode != 200) {
            bot.sendMessage(msg.chat.id, '抓取結果時發生錯誤！');
            return;
        }
        const processItem = function () {
            $("item").each(function (i, elem) {
                if (msg.chat.type == 'private') {
                    result.push(util.format('<a href="%s">%s</a>',
                        $(this).children('link').text(),
                        $(this).children('title').text().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
                }
                else if (i < 5) {
                    result.push(util.format('<a href="%s">%s</a>',
                        $(this).children('link').text(),
                        $(this).children('title').text().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
                }
            });
            bot.sendMessage(msg.chat.id, result.join('\n\n'), {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                disable_notification: true
            });
        };

        let result = [];
        let $ = cheerio.load(body, {
            xmlMode: true
        });
        if ($("item").index() > 0) {
            result.push('目前搜尋範圍：季度全集');
            processItem();
        }
        else request('http://share.dmhy.org/topics/rss/rss.xml?keyword=' + keyword, (err, res, body) => {
            if (err || res.statusCode != 200) {
                bot.sendMessage(msg.chat.id, '抓取結果時發生錯誤！');
                return;
            }

            $ = cheerio.load(body, {
                xmlMode: true
            });
            if ($("item").index() > 0) {
                result.push('目前搜尋範圍：全部');
                processItem();
            }
            else bot.sendMessage(msg.chat.id, '找不到任何結果！');
        });
    });
};

const getUpdate = function () {
    request('https://share.dmhy.org/topics/rss/rss.xml', (err, res, body) => {
        if (err || res.statusCode != 200) {
            console.log('update fetch failed!');
            return;
        }
        let tmpDate,
            $ = cheerio.load(body, {
                xmlMode: true
            });

        $("item").each(function (i, elem) {
            let date = moment($(this).children('pubDate').text(), 'ddd, DD MMM YYYY HH:mm:ss ZZ');
            if (pubDate.isBefore(date)) {
                results.push(util.format('<a href="%s">%s</a>',
                    $(this).children('link').text(),
                    $(this).children('title').text().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
                if (!tmpDate) tmpDate = date;
            }
        });
        if (tmpDate) pubDate = tmpDate;
        let message = results.slice().reverse();
        if (results.length === 0) message.push("現在沒有更新內容喔 (&gt;﹏&lt;)");
        if (messageIDs.length === 0) {
            config.channel.forEach(channel => {
                bot.sendMessage(channel, message.join('\n\n'), {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    disable_notification: true
                }).then(msg => {
                    messageIDs.push({
                        chat_id: msg.chat.id,
                        message_id: msg.message_id
                    });
                }).catch(e => {
                    console.log('Send Update to %s failed! Error: %s', channel, e.message);
                });
            });
        }
        else {
            messageIDs.forEach(id => {
                bot.editMessageText(message.join('\n\n'), {
                    chat_id: id.chat_id,
                    message_id: id.message_id,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    disable_notification: true
                }).catch(() => {});
            });
        }
    });
};

schedule.scheduleJob('0 * * * * *', getUpdate);
schedule.scheduleJob('0 * * * *', () => {
    messageIDs = [];
    results = [];
});
