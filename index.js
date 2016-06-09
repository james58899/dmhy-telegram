const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');
const util = require('util');
const TelegramBot = require('node-telegram-bot-api');

var username, pubDate;

var config = JSON.parse(fs.readFileSync('data.json', 'utf8'));
var bot = new TelegramBot(config.key, {
    polling: true
});

bot.getMe().then(function(me) {
    username = me.username;
});

bot.on('new_chat_participant', function(msg) {
    if (msg.new_chat_member.username === username) {
        console.log('join %s(%s)', msg.chat.title, msg.chat.id);
        config.channel.push(msg.chat.id);
        fs.writeFile('data.json', JSON.stringify(config));
    }
});

bot.on('left_chat_participant', function(msg) {
    if (msg.left_chat_member.username === username) {
        console.log('left %s(%s)', msg.chat.title, msg.chat.id);
        config.channel.splice(config.channel.indexOf(msg.chat.id), 1);
        fs.writeFile('data.json', JSON.stringify(config));
    }
});

var getUpdate = function() {
    request('https://share.dmhy.org/topics/rss/sort_id/2/rss.xml', function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var $ = cheerio.load(body, {
                xmlMode: true
            });
            var item = $("item").first();
            if (pubDate != item.children('pubDate').text()) {
                pubDate = item.children('pubDate').text();
                var text = util.format('<a href="%s">%s</a>', item.children('link').text(), item.children('title').text());
                config.channel.forEach(function(channel) {
                    console.log('%s => %s: %s', username, channel, text);
                    bot.sendMessage(channel, text, {
                        parse_mode: 'HTML',
                        disable_notification: true
                    });
                });
            }
        }
    });
};

setInterval(getUpdate, 5000);