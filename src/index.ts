import DEBUG from "debug";
import { createPingForState, createRelayAction } from "./dobiss";
import { convertBufferToByteArray } from "./helpers";
import SocketClient from "./rx-socket";
import { Socket } from "net";
import { from, empty, queueScheduler } from "rxjs";

import {
    multicast,
    map,
    switchMap,
    switchMapTo,
    shareReplay,
    take,
    tap,
    observeOn,
    delay,
    concatMap,
    filter,
    merge
} from "rxjs/operators";

import { types } from "util";

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

const socketClient = new SocketClient({ host: config.dobiss.host, port: config.dobiss.port })

const TYPES = {
    toggle: Symbol('toggle'),
    poll: Symbol('poll'),
}

const toggleSalon = { action: TYPES.toggle, location: "salon" };
const toggleEetplaats = { action: TYPES.toggle, location: "eetplaats" };

const commands$ = from([
    toggleSalon,
    toggleEetplaats,
]);

// Now we will create observables for every action.
// In the processor we will concatMap these so that we do one action after the other.
const actions$ = commands$
    .pipe(
        filter((item) => item.action === TYPES.toggle),
        map((item) => {
            const location = getLocation(item.location);

            if (!location) {
                return empty();
            }

            const buffer = createRelayAction(location.relay, location.output, 0x02)

            if (!buffer) {
                return empty();
            }

            return socketClient
                .send(buffer);
        }),
    );

// We make sure to provice an observable of observables.
// Every internal observable will complete when the jorb is done.
// So that the next observable can start.
// This way it's impossible to do multiple things at once on the socket.
const processor$ = actions$
    .pipe(
        concatMap((obs$) => {
            return obs$;
        }),
    );

processor$
    .subscribe({
        next: (out: any) => {
            console.log("out", out);
        },
        error(e) {
            console.error('BAM', e)
        },
        complete() {
            console.log("I'm out.")
        }
    });
