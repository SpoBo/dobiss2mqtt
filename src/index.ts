
import DEBUG from "debug";
import { Socket } from "net";

import { convertBufferToByteArray } from "./helpers";
const config = require("../config");

const debug = DEBUG("dobiss");

const socket = new Socket();

const HEADER_DEFAULTS = {
    colDataCount: 8,
    colMaxCount: 8,
    high: 0,
    low: 0,
    rowCount: 1,
};

// A header is a 16bit buffer, Delimited by 175 for start and end.
function createHeaderPayload (options: { code: number, type: number, relais: number, colDataCount?: number }) {
    const {
        code,
        type,
        relais,
        high,
        low,
        colMaxCount,
        rowCount,
        colDataCount,
    } = { ...HEADER_DEFAULTS, ...options };

    return Buffer.from([
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
        175,
    ]);
}

/**
 * @param {number} type
 * @param {number} address
 */
function createActionHeaderPayload (options: { type: number, relais: number }) {
    return createHeaderPayload({ type: options.type, relais: options.relais, code: 2 });
}

function createSimpleActionBuffer(options: { relais: number, output: number, action: number }): Buffer {
    return Buffer.from([options.relais, options.output, options.action, 255, 255, 64, 255, 255]);
}

function writeHexBufferToSocket (socket: Socket, buffer: Buffer) {
    debug("writing hex %o, ascii: %o", buffer.toString("hex"), convertBufferToByteArray(buffer));
    socket.write(buffer);
    debug("done writing");
}

function writeBuffersToSocket (...buff: Buffer[]) {
    writeHexBufferToSocket(socket, Buffer.concat(buff));
}

function performRelayAction(relais: number, output: number, action: number) {
    const header = createActionHeaderPayload(
        {
            type: 8,
            relais,
        },
    );

    const body = createSimpleActionBuffer(
        {
            relais,
            output,
            action,
        },
    );

    writeBuffersToSocket(header, body);
}

function pingForState (relais: number) {
    const buff = createHeaderPayload({
        code: 1,
        colDataCount: 0, // don't know why it needs to be 0 for data. maybe to allow a bigger response?
        relais,
        type: 8, // don't know what 8 is ... .
    });

    writeBuffersToSocket(buff);
}

type Location = { relay: number, output: number };

function getLocation (name: string): Location | null {
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
        return null;
    }

    return { relay, output } as Location;
}

socket.on("connect", () => {
    debug("connected");


    //pingForState(0x01);

    const location = getLocation("salon");

    console.log({ location });

    if (location) {
        performRelayAction(location.relay, location.output, 0x02);
    }
});

socket.on("close", () => {
    console.log("close");
});

socket.on("data", function(d) {
    const byteArray = convertBufferToByteArray(d);
    debug("received hex %o, ascii %o", d.toString("hex"), byteArray);
});

socket.on("drain", function() {
    console.log("drain");
});

socket.on("end", function() {
    console.log("end");
});

socket.on("error", function(e) {
    console.log("error", e.message);
});

socket.on("lookup", function() {
    console.log("lookup");
});

socket.on("timeout", function() {
    console.log("timeout");
});

debug("going to connect");
socket
    .connect({ host: config.dobiss.ip, port: config.dobiss.port });
