const { Socket } = require('net');
const debug = require('debug')('dobiss')

const ip = '10.0.0.8';
const port = 10001;

// CANBUS NOT MODBUS !!!
// https://www.csselectronics.com/screen/page/can-bus-logger-downloads
// https://sicherheitskritisch.de/2018/05/can-bus-asysbus-component-for-smart-home-system-home-assistant-en/
// https://harrisonsand.com/can-on-the-raspberry-pi/
// https://circuitdigest.com/microcontroller-projects/arduino-can-tutorial-interfacing-mcp2515-can-bus-module-with-arduino
// heb module besteld voor het via een pi te doen

const exits = [
    [
        "berging", // 1.1
        "koele_berging", // 1.2
        "wc", // 1.3
        "inkomhal", // 1.4
        "inkomdeur", // 1.5
        "salon", // 1.6
        "eetplaats", // 1.7
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

// https://community.home-assistant.io/t/tcp-commands-for-ethernet-relay/84830/8

const socket = new Socket();

const HEADER_DEFAULTS = {
    high: 0,
    low: 0,
    colMaxCount: 8,
    rowCount: 1,
    colDataCount: 8
}

// It sends 16bit buffers, delimited by 175 for start and end.
// HeaderStruct.cs
function createHeaderPayload(options) {
    const {
        code,
        type,
        relais,
        high,
        low,
        colMaxCount,
        rowCount,
        colDataCount
    } = { ...HEADER_DEFAULTS, ...options };

    return new Buffer.from([
        175,
        code,
        type,
        relais,
        high,
        low,
        colMaxCount,
        rowCount,

        colDataCount,
        255,
        255,
        255,
        255,
        255,
        255,
        175
    ]);
}

/**
 * @param {number} type
 * @param {number} address
 */
function createActionHeaderPayload({ type, relais }) {
    return createHeaderPayload({ type, relais, code: 2 });
}

function createSimpleActionBuffer({ relais, output, action }) {
    return new Buffer.from([relais, output, action, 255, 255, 64, 255, 255]);
}

function writeHexBufferToSocket(socket, buffer) {
    debug('writing hex %o, ascii: %o', buffer.toString('hex'), bufferToByteArray(buffer));
    socket.write(buffer);
    debug('done writing');
}

function writeBuffersToSocket(...buff) {
    writeHexBufferToSocket(socket, Buffer.concat(buff))
}

function performRelayAction(relais, output, action = 0x02) {
    const header = createActionHeaderPayload(
        {
            type: 8,
            relais
        }
    )
    const body = createSimpleActionBuffer(
        {
            relais,
            output,
            action
        }
    )

    writeBuffersToSocket(header, body)
}

function pingForState(relais) {
    writeRawHEXToSocket(
        [
            0xAF,
            0x01,
            0x08,
            relais,
            0x00,
            0x00,
            0x00,
            0x01,

            0x00,
            0xFF,
            0xFF,
            0xFF,
            0xFF,
            0xFF,
            0xFF,
            0xAF,
        ]
    )
}

function getLocation(name) {
    let relay;
    let output;
    let found;

    for (relay = 1; relay < exits.length + 1; relay++) {
        for (output = 0; relay < exits[relay - 1].length; output++) {
            if (exits[relay - 1][output] === name) {
                found = true;
                break;
            }
        }

        if (found) {
            break;
        }
    }

    if (!found) {
        return null
    }

    return [ relay, output ]
}

socket.on('connect', function() {
    debug('connected');

    // say hello
    // socket.write(createPayloadBuffer({ code: 5 }));

    // import programmer version? MainWindow.Com.ImportProgrammerVersion();

    // toggle my light
    setInterval(() => {
        //pingForState(0x02)
    }, 500)

    const location = getLocation('eetplaats')

    console.log({ location })

    if (location) {
        performRelayAction(...location)
    }
})

socket.on('close', function() {
    console.log('close');
})

socket.on('data', function(d) {
    const byteArray = bufferToByteArray(d);
    debug('received hex %o, ascii %o', d.toString('hex'), byteArray)
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
