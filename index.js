const cheerio = require('cheerio'),
    fs = require('fs'),
    util = require('util'),
    moment = require('moment'),
    schedule = require('node-schedule'),
    TelegramBot = require('node-telegram-bot-api'),
    request = require("request");

var username, updateTime;
var pubDate = moment();
var config = JSON.parse(fs.readFileSync('data.json', 'utf8'));
var bot = new TelegramBot(config.key, {
    polling: {
        timeout: 60,
        interval: 0
    }
});

bot.getMe().then(me => {
    username = me.username;
});

bot.onText(/^\/(\w+)@?\w*/i, function(msg, regex) {
    if (msg.chat.type === 'private') {
        console.log('%s(%s) => %s: %s', msg.from.username, msg.from.id, username, msg.text);
    }
    else console.log('%s(%s) => %s(%s): %s', msg.from.username, msg.from.id, msg.chat.title, msg.chat.id, msg.text);


    switch (regex[1]) {
        case 'update':
            if (!updateTime || updateTime.add(10, 'm').isBefore(moment())) {
                getUpdate();
                updateTime = moment();
            }
            break;
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

bot.on('new_chat_participant', function(msg) {
    if (msg.new_chat_member.username === username) {
        console.log('join %s(%s)', msg.chat.title, msg.chat.id);
        if (config.channel.indexOf(msg.chat.id) < 0) {
            config.channel.push(msg.chat.id);
            fs.writeFile('data.json', JSON.stringify(config));
        }
    }
});

bot.on('left_chat_participant', function(msg) {
    if (msg.left_chat_member.username === username) {
        console.log('left %s(%s)', msg.chat.title, msg.chat.id);
        if (config.channel.indexOf(msg.chat.id) > -1) {
            config.channel.splice(config.channel.indexOf(msg.chat.id), 1);
            fs.writeFile('data.json', JSON.stringify(config));
        }
    }
});

var search = function(msg) {
    var keyword = msg.text.match(/\s(.+)/);
    if (!keyword) {
        bot.sendMessage(msg.chat.id, '請輸入要搜尋的關鍵字！\n範例：/search 果 青\n群組內僅顯示五個結果\n更多資訊請看 https://share.dmhy.org/cms/page/name/faq.html#faq3');
        return;
    }

    keyword = encodeURI(keyword[1].replace(' ', '+'));
    request('https://share.dmhy.org/topics/rss/sort_id/31/rss.xml?keyword=' + keyword, function(err, res, body) {
        if (err || res.statusCode != 200) {
            bot.sendMessage(msg.chat.id, '抓取結果時發生錯誤！\n錯誤代碼：' + res.statusCode);
            return;
        }
        var processItem = function() {
            $("item").each(function(i, elem) {
                if (msg.chat.type == 'private') {
                    result.push(util.format('<a href="%s">%s</a>', $(this).children('link').text(), $(this).children('title').text()));
                }
                else if (i < 5) {
                    result.push(util.format('<a href="%s">%s</a>', $(this).children('link').text(), $(this).children('title').text()));
                }
            });
            bot.sendMessage(msg.chat.id, result.join('\n\n'), {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                disable_notification: true
            });
        };

        var result = [];
        var $ = cheerio.load(body, {
            xmlMode: true
        });
        if ($("item").index() > 0) {
            result.push('目前搜尋範圍：季度全集');
            processItem();
        }
        else request('http://share.dmhy.org/topics/rss/rss.xml?keyword=' + keyword, function(err, res, body) {
            if (err || res.statusCode != 200) {
                bot.sendMessage(msg.chat.id, '抓取結果時發生錯誤！\n錯誤代碼：' + res.statusCode);
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

var getUpdate = function() {
    request('https://share.dmhy.org/topics/rss/sort_id/2/rss.xml', function(err, res, body) {
        if (err || res.statusCode != 200) {
            console.log('update fetch failed! code:%s', res.statusCode);
            return;
        }
        var messages = [];
        var tmpDate;
        var $ = cheerio.load(body, {
            xmlMode: true
        });

        $("item").each(function(i, elem) {
            var date = moment($(this).children('pubDate').text(), 'ddd, DD MMM YYYY HH:mm:ss ZZ');
            var filter = $(this).children('title').text().match(/(繁|big5|cht)/ig);
            if (pubDate.isBefore(date) && filter) {
                messages.push(util.format('<a href="%s">%s</a>', $(this).children('link').text(), $(this).children('title').text()));
                if (!tmpDate) tmpDate = date;
            }
        });
        if (tmpDate) pubDate = tmpDate;

        console.log('fetch %s updates', messages.length);
        if (messages.length > 0) {
            messages.reverse();
            config.channel.forEach(function(channel) {
                bot.sendMessage(channel, messages.join('\n\n'), {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    disable_notification: true
                }).then(i => {
                    console.log('Send Update to %s', channel);
                }).catch(e => {
                    console.log('Send Update to %s failed! Error: %s', channel, e.message);
                });
            });
        }
    });
};

schedule.scheduleJob('0 * * * *', getUpdate);
