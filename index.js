const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');
const util = require('util');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');

var username;

var pubDate = moment();
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

var getUpdate = function() {
    request('https://share.dmhy.org/topics/rss/sort_id/2/rss.xml', function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var messages = [];
            var tmpDate;
            var $ = cheerio.load(body, {
                xmlMode: true
            });

            $("item").each(function(i, elem) {
                var date = moment($(this).children('pubDate').text(), 'ddd, DD MMM YYYY HH:mm:ss ZZ');
                if (pubDate.isBefore(date)) {
                    messages.push(util.format('<a href="%s">%s</a>', $(this).children('link').text(), $(this).children('title').text()));
                    if (!tmpDate) tmpDate = date;
                }
            });
            if (tmpDate) pubDate = tmpDate;

            if (messages.length > 0) {
                messages.reverse();
                messages.forEach(function(msg) {
                    config.channel.forEach(function(channel) {
                        console.log('%s => %s: %s', username, channel, msg);
                        bot.sendMessage(channel, msg, {
                            parse_mode: 'HTML',
                            disable_web_page_preview : true,
                            disable_notification: true
                        });
                    });
                });
            }
        }
    });
};

setInterval(getUpdate, 600000);