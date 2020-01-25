const { Socket } = require('net');
const debug = require('debug')('dobiss')
// CANBUS NOT MODBUS !!!
// https://www.csselectronics.com/screen/page/can-bus-logger-downloads
// https://sicherheitskritisch.de/2018/05/can-bus-asysbus-component-for-smart-home-system-home-assistant-en/
// https://harrisonsand.com/can-on-the-raspberry-pi/
// https://circuitdigest.com/microcontroller-projects/arduino-can-tutorial-interfacing-mcp2515-can-bus-module-with-arduino
// heb module besteld voor het via een pi te doen
const exits = [
    [
        "berging", // 1.1
        "koele berging", // 1.2
        "wc",
        "inkomhal",
        "inkomdeur",
        "salon",
        "eetplaats",
        "keuken",
        "terras",
        "badkamer",
        "master_bedroom",
        "dressing"
    ],
    [
        "nachthal", // 2.1
        "fitness",
        "office",
        "traphal",
        "zolder_1",
        "zolder_2",
    ]
]

const switches = [
    [
        "nachthal_stairs_left",
        "nachthal_stairs_right",
        "nachthal_end_left",
        "nachthal_end_right",
        "office",
        "fitness",
        "master_bedroom",
        "dressing",
        "nachthal_zolder",
        "zolder_1",
        "zolder_2"
    ],
    [
        "berging",
        "koele_berging",
        "traphal_beneden",
        "keuken_left_top",
        "keuken_right_top",
        "keuken_right_bottom",
        "keuken_left_bottom",
        "dinner_left_top",
        "dinner_right_top",
        "dinner_right_bottom",
        "dinner_left_top",
        "salon_left",
        "salon_right",
        "inkomhal_single",
        "inkomhal_left",
        "inkomhal_right",
        "toilet",
        "kitchen_counter",
        "bathroom"
    ]
    
]

// https://community.home-assistant.io/t/tcp-commands-for-ethernet-relay/84830/8

// modbus poll / modbus slave apps (don't work because there's an IP translation layer due to Dobiss CAN Programmer)
// What app did I use to decompile Dobiss Can Programmer ? dotPeek (JetBrains)

// The goal is to read shit from the CAN bus via the LAN interface.
// The ideal scenario is that I can intercept the remote signals and pass those actions off to node-red or HASS.
// This way I can leave all lights on all t he time by disconnecting the switches from Dobiss and then making the switches send commands to HASS / Hue instead.
// Plan B is to just be able to turn on or off lights. This would allow me to turn on the light when HASS turns on the light should not not be on yet.
const ip = '10.0.0.8';
const port = 10001;
const socket = new Socket();

// It sends 16bit buffers, delimited by 175 for start and end.
// HeaderStruct.cs
function createHeaderPayload({ code, type, address, high, low, colMaxCount, rowCount, colDataCount }) {
    // 255 = Byte.MaxValue
    return new Buffer.from([0XAF, code, type, address, high, low, colMaxCount, rowCount, colDataCount, 0XFF, 0XFF, 0XFF, 0XFF, 0XFF, 0XFF, 0XAF]);
}

/**
 * 
 * @param {number} type
 * @param {number} address
 */
function createActionHeaderPayload({ type, address }) {
    return createHeaderPayload({ type, address, code: 2, high: 0, low: 0, colMaxCount: 8, rowCount: 1, colDataCount: 8});
}

function createSimpleActionBuffer({ address, output, action }) {
    return new Buffer.from([address, output, action, 255, 255]);
}

function bufferToByteArray(buffer) {
    const hexString = buffer.toString('hex');
    var hex = hexString.toString();
    var ints = [];
    // grab by the pairs and convert to ints
    for (var i = 0; i < hex.length; i += 2) {
        ints.push(parseInt(hex.substr(i, 2), 16));
    }
    return ints;
}

function writeRawHEXToSocket(hexArray) {
    debug('writing hex %s', hexArray);

    socket.write(
        // NOTE: This seems to be like a fixed wakeup header.
        new Buffer.from(hexArray)
    );

    debug('done writing')
}

socket.on('connect', function() {
    debug('connected');

    // say hello
    // socket.write(createPayloadBuffer({ code: 5 }));

    // import programmer version? MainWindow.Com.ImportProgrammerVersion();

    // turn on my light
    // first send an action header to do something on relais 1
    // not sure what the type and address should be :'(
    //socket.write(createActionHeaderPayload({ type: 0X00 /* relais */, address: 0X08, action: 0X02 /* toggle */ }))

    // action header
    setTimeout(function() {
        const outputAddress = 0x01; // relais 1. also have relais 2.
        const outputID = 0x01;

        // NOTE: This seems to be like a fixed wakeup header.
        writeRawHEXToSocket(
            [
                0xAF,
                0x02,
                0x08,
                0x01,
                0x00,
                0x00,
                0x08,
                0x01,
                0x08,
                0xFF,
                0xFF,
                0xFF,
                0xFF,
                0xFF,
                0xFF,
                0xAF
            ]
        );

        // action body (immediately after)
        writeRawHEXToSocket(
            [
                outputAddress,
                outputID,
                0x02, // 0x00 off, 0x01 on, 0x02 toggle
                0xFF,
                0xFF,
                0x64,
                0xFF,
                0xFF
            ]
        )
    }, 500)

    // then say that we want to turn on port 4 on relais 1 ? action = 1 = on (relais met module 1, uitgang 4 = inkomhal)
    //setTimeout(() => socket.write(createSimpleActionBuffer({ address: 1, output: 4, action: 1 })), 1000)
})

socket.on('close', function() {
    console.log('close');
})

socket.on('data', function(d) {
    const byteArray = bufferToByteArray(d);
    debug('received raw data %s', byteArray);
    // TODO: convert this to HEX
})

socket.on('drain', function() {
    console.log('drain');
})

socket.on('end', function() {
    console.log('end');
})

socket.on('error', function(e) {
    console.log('error', e.message);
})

socket.on('lookup', function() {
    console.log('lookup');
})

socket.on('timeout', function() {
    console.log('timeout');
})

// @TODO: Autodiscover ? There is an autodiscover header ... but we still need to send that somewhere :|
debug('going to connect')
socket
    .connect({ host: ip, port });
