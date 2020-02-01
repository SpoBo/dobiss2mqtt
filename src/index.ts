import DEBUG from "debug";
import { createPingForState, createRelayAction } from "./dobiss";
import { convertBufferToByteArray } from "./helpers";
import socket, { SocketClient } from "./rx-socket";
import { Socket } from "net";
import { ReplaySubject } from "rxjs";
import { refCount, multicast } from "rxjs/operators";

const config = require(process.env.CONFIG_PATH || "../config");
// TODO: create an API around the config. Could become streamable config.

const debug = DEBUG("dobiss2mqtt.index");

// TODO: This needs to be all up inside the socket API ... .
function writeBuffersToSocket (socket: Socket, ...buff: Buffer[]) {
    const buffer = Buffer.concat(buff);
    socket.write(buffer);
    debug("done writing");
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

/*
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
*/

const socket$ = socket({ host: config.dobiss.host, port: config.dobiss.port });
    //.pipe(multicast(() => new ReplaySubject(1), refCount()))

const client = socket$
    .subscribe((instance: SocketClient) => {
        const location = getLocation("salon");

        console.log({ location });

        if (location) {
            instance
                .send(createRelayAction(location.relay, location.output, 0x02))
                .subscribe(() => {
                    console.log('toggled', location);
                });
        }
    });

setTimeout(() => {
    client.unsubscribe();
}, 1000);
