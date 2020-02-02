import DEBUG from "debug";

import DobissState, {
    createPingForState,
    createRelayAction,
} from "./dobiss";

import SocketClient from "./rx-socket";

import {
    empty,
    merge,
    Subject,
} from "rxjs";

import {
    concatMap,
    filter,
    map,
} from "rxjs/operators";

const config = require(process.env.CONFIG_PATH || "../config");
// TODO: create an API around the config. Could become streamable config.

const debug = DEBUG("dobiss2mqtt.index");

const socketClient = new SocketClient({ host: config.dobiss.host, port: config.dobiss.port });

enum TYPES {
    toggle,
    on,
    off,
    poll,
}

interface IActionType {
    type: TYPES;
};

interface IRelayAction extends IActionType {
    type: TYPES.toggle | TYPES.on | TYPES.off;
    location: string;
};

interface IPollAction extends IActionType {
    type: TYPES.poll;
    location: number;
};

const toggleSalon: IRelayAction = { type: TYPES.toggle, location: "salon" };
const toggleEetplaats: IRelayAction = { type: TYPES.toggle, location: "eetplaats" };

const pollFirst: IPollAction = { type: TYPES.poll, location: 0x01 };

const commands$: Subject<IRelayAction | IPollAction> = new Subject();

const state = new DobissState(config.relays)

// Now we will create observables for every action.
// In the processor we will concatMap these so that we do one action after the other.
const actions$ = commands$
    .pipe(
        filter((item) => item.type === TYPES.toggle || item.type === TYPES.on || item.type === TYPES.off),
        map((item) => {
            const location = state.getLocation(item.location as string);

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
            const response$ = socketClient
                .send(createPingForState({ relais: item.location as number }));

            return response$
                .pipe(
                    map((response) => {
                        console.log({ response });
                        return true;
                    }),
                );
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

// TODO: Create a service which will be based off of the config.
//       It will expose an initial state for every configured light.
//       If we push it states for a specific relais it will update the internal states of the lights.
//       This big service will emit the full state of the light whenever it has changed.
//       Everything needed to construct a message on mqtt to indicate the state of the light.
// TODO: Create something which, given the config, will expose a set of lights.
// commands$.next(toggleSalon);
// commands$.next(toggleEetplaats);
commands$.next(pollFirst);
