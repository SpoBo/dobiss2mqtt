import config from './config.mjs';

import { Socket } from 'net';
import DEBUG from 'debug';

const debug = DEBUG('dobiss');

const socket = new Socket();

const HEADER_DEFAULTS = {
    high: 0,
    low: 0,
    colMaxCount: 8,
    rowCount: 1,
    colDataCount: 8
}

// A header is a 16bit buffer, Delimited by 175 for start and end.
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
    const buff = createHeaderPayload({
        code: 1,
        relais,
        type: 8, // don't know what 8 is ... .
        colDataCount: 0 // don't know why it needs to be 0 for data. maybe to allow a bigger response?
    })

    writeBuffersToSocket(buff)
}

function getLocation(name) {
    let relay;
    let output;
    let found;

    for (relay = 1; relay < config.exits.length + 1; relay++) {
        for (output = 0; relay < config.exits[relay - 1].length; output++) {
            if (config.exits[relay - 1][output] === name) {
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

        pingForState(0x01)
    setInterval(() => {
    }, 500)

    return;
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

debug('going to connect')
socket
    .connect({ host: config.dobiss.ip, port: config.dobiss.port });

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
