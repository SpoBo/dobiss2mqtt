import DEBUG from "debug";
import { Socket } from "net";
import { createPingForState, createRelayAction } from "./dobiss";
import { convertBufferToByteArray } from "./helpers";

const config = require(process.env.CONFIG_PATH || "../config");

const debug = DEBUG("dobiss");

const socket = new Socket();

function writeHexBufferToSocket (buffer: Buffer) {
    debug("writing hex %o, ascii: %o", buffer.toString("hex"), convertBufferToByteArray(buffer));
    socket.write(buffer);
    debug("done writing");
}

function writeBuffersToSocket (...buff: Buffer[]) {
    writeHexBufferToSocket(Buffer.concat(buff));
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

    writeBuffersToSocket(createPingForState({ relais: 0x01 }));
    writeBuffersToSocket(createPingForState({ relais: 0x02 }));

    const location = getLocation("salon");

    console.log({ location });

    if (location) {
        writeBuffersToSocket(createRelayAction(location.relay, location.output, 0x02));
    }
});

socket.on("close", () => {
    console.log("close");
});

socket.on("data", (d) => {
    const byteArray = convertBufferToByteArray(d);
    debug("received hex %o, ascii %o", d.toString("hex"), byteArray);
});

socket.on("drain", () => {
    console.log("drain");
});

socket.on("end", () => {
    console.log("end");
});

socket.on("error", (e) => {
    console.log("error", e.message);
});

socket.on("lookup", () => {
    console.log("lookup");
});

socket.on("timeout", () => {
    console.log("timeout");
});

debug("going to connect");
socket
    .connect({ host: config.dobiss.ip, port: config.dobiss.port });
