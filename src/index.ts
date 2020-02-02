import DEBUG from "debug";
import { Socket } from "net";
import { createPingForState, createRelayAction } from "./dobiss";
import { convertBufferToByteArray } from "./helpers";
import SocketClient from "./rx-socket";

import {
    empty,
    from,
    merge,
    Observable,
    queueScheduler,
} from "rxjs";

import {
    concatMap,
    delay,
    filter,
    map,
    multicast,
    observeOn,
    shareReplay,
    switchMap,
    switchMapTo,
    take,
    tap,
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

const socketClient = new SocketClient({ host: config.dobiss.host, port: config.dobiss.port });

enum TYPES {
    toggle,
    on,
    off,
    poll,
}

type ActionType = {
    type: TYPES,
};

type RelayAction = {
    type: TYPES.toggle | TYPES.on | TYPES.off,
    location: string,
};

type PollAction = {
    type: TYPES.poll,
    location: number,
};

const toggleSalon = { type: TYPES.toggle, location: "salon" };
const toggleEetplaats = { type: TYPES.toggle, location: "eetplaats" };

const pollFirst = { type: TYPES.poll, location: 0x01 };

const commands$ = from([
    toggleSalon,
    toggleEetplaats,
    pollFirst,
]);

// Now we will create observables for every action.
// In the processor we will concatMap these so that we do one action after the other.
const actions$ = commands$
    .pipe(
        filter((item) => item.type === TYPES.toggle || item.type === TYPES.on || item.type === TYPES.off),
        map((item) => {
                const location = getLocation(item.location as string);

                if (!location) {
                    return empty();
                }

                const buffer = createRelayAction(location.relay, location.output, 0x02);

                if (!buffer) {
                    return empty();
                }

                return socketClient
                    .send(buffer);
        }),
    );

const polls$ = commands$
    .pipe(
        filter((item) => item.type === TYPES.poll),
        map((item) => {
            if (item.type === TYPES.poll) {
                const response$ = socketClient
                    .send(createPingForState({ relais: item.location as number }));

                return response$
                    .pipe(
                        map((response) => {
                            console.log({ response });
                            return true;
                        }),
                    );
            }

            return empty();
        }),
    );

// We make sure to provice an observable of observables.
// Every internal observable will complete when the jorb is done.
// So that the next observable can start.
// This way it's impossible to do multiple things at once on the socket.
const stuff$ = merge(actions$, polls$);

const processor$ = stuff$
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
            console.error("BAM", e);
        },
        complete() {
            console.log("I'm out.");
        },
    });
