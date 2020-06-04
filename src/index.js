#!/usr/bin/env node

const MQTT = require('mqtt');
const BraviaDiscovery = require('bravia-simple-ip-control').default;

const config = require('./config.js');

BraviaDiscovery
    .on('founddevice', setupNewDevice)
    .on('lostdevice',  forgetDevice)
    .discover();

const clients = { };

const STATUS_OPTS = { qos: 2, retain: true };

function getTopic(dev, suffix) {
    return `${config.name}:${dev.id}/${suffix}`;
}

function publishMessage({ topic, message, client, retain }) {
    console.log(`publish: ${topic}: ${message}`);
    client.publish(topic, message !== null ? message.toString() : null, { qos: 2, retain });
}

function setupNewDevice(device) {
    console.log(`Creating client for: ${device.id}`);

    let client = clients[device.id];
    if (!client) {
        client = clients[device.id] = MQTT.connect(config.broker, {
            will: {
                topic:   getTopic(device, 'connected'),
                payload: '0',
                ...STATUS_OPTS
            }
        });
    }

    publishMessage({ client, topic: getTopic(device, 'connected'), message: '2', retain: true })

    const getEventHandler = topic => value =>
        publishMessage({ client, topic: getTopic(device, topic), message: value, retain: true });

    device
        .on("power-changed",       getEventHandler('status/isOn'))
        .on("volume-changed",      getEventHandler('status/volume'))
        .on("mute-changed",        getEventHandler('status/isMuted'))
        .on("channel-changed",     getEventHandler('status/channel'))
        .on("input-changed",       getEventHandler('status/input'))
        .on("piture-mute-changed", getEventHandler('status/isPictureMuted'))
        .on("pip-changed",         getEventHandler('status/isPipEnabled'))

    const topics = [getTopic(device, 'set/#'), getTopic(device, 'get/#'), getTopic(device, 'toggle/#')];
    client.subscribe(topics);

    client.on('message', (topic, msg) => {
        const message = msg.toString();
        const match = topic.match(/(set|get|toggle)\/(.*)$/);

        console.log(`received: ${topic}: ${message}`);

        if (match) {
            const [, command, func] = match;

            const obj = device[func];
            if (typeof obj !== 'undefined') {
                let cmd;
                if (typeof obj === 'function') {
                    cmd = obj;
                } else if (command in obj) {
                    cmd = obj[command];
                }

                cmd && cmd(message).subscribe(getEventHandler(`status/${func}`));
            }
        }
    })
}

function forgetDevice(device) {
    console.log(`Removing client for: ${device.id}`);

    publishMessage({ client: clients[device.id], topic: getTopic(device, 'connected'), message: '1', retain: true });

    [
        "power-changed",
        "volume-changed",
        "mute-changed",
        "channel-changed",
        "input-changed",
        "piture-mute-changed",
        "pip-changed"
    ]
    .forEach((e) => device.removeAllListeners(e));
}
